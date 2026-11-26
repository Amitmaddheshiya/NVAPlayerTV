import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Device from '../models/Device';
import Media from '../models/Media';
import Group from '../models/Group';
import AuditLog from '../models/AuditLog';
import ScheduleTemplate from '../models/Schedule';
import GlobalConfig from '../models/GlobalConfig';
import { getStorageService } from '../config/storage';
import { getSocketInstance } from '../socket/socket';
import { getMediaPathFromUrl } from '../utils/mediaUrl';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from '../config/redis';
import { invalidateDevicePaths, invalidateMediaAuth } from '../utils/fileAccessCache';
import { checkDeviceLimit } from '../utils/quota';

// Sub-user is an explicit role. Dealer customers also carry parentId but are
// full 'user' accounts — they must NOT be treated as sub-users.
const isSubUserAccount = (user: any): boolean => user?.role === 'sub-user';
const presentUser = (user: any): any => {
  const value = typeof user?.toObject === 'function' ? user.toObject() : user;
  return value ? { ...value, role: isSubUserAccount(value) ? 'sub-user' : value.role } : value;
};

/**
 * Account origin for display: admin / dealer / user / d-user (dealer
 * customer) / sub-user / d-sub-user (sub-user of a dealer customer).
 */
export const resolveAccountType = async (user: any): Promise<string> => {
  if (!user) return 'user';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'dealer') return 'dealer';
  const parent = user.parentId
    ? await User.findById(user.parentId).select('role parentId').lean()
    : null;
  if (user.role === 'sub-user') {
    if (parent?.parentId) {
      const grand = await User.findById(parent.parentId).select('role').lean();
      if ((grand as any)?.role === 'dealer') return 'd-sub-user';
    }
    return 'sub-user';
  }
  return (parent as any)?.role === 'dealer' ? 'd-user' : 'user';
};

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '10', search, role, sortBy, sortOrder } = req.query;
    const filter: any = {};

    // Search filter - search in email, name
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      filter.$or = [
        { email: searchRegex },
        { name: searchRegex }
      ];
    }

    // Role filter — dealers only ever see their own customer accounts.
    if (req.userRole === 'dealer') {
      filter.parentId = req.userId;
      filter.role = 'user';
    } else if (role === 'sub-user') {
      filter.$and = [{ $or: [{ role: 'sub-user' }, { role: 'user', parentId: { $exists: true, $ne: null } }] }];
    } else if (role === 'user') {
      // 'user' role = standalone accounts only; dealer customers are managed
      // from the dealer screen and legacy child accounts stay under sub-user.
      filter.$and = [{ role: 'user' }, { $or: [{ parentId: null }, { parentId: { $exists: false } }] }];
    } else if (role) {
      filter.role = role;
    } else if (req.userRole !== 'admin') {
      // Default list hides sub-users and dealer accounts.
      filter.$and = [
        { $or: [{ role: { $exists: false } }, { role: { $ne: 'sub-user' } }] },
        { $or: [{ role: { $exists: false } }, { role: { $ne: 'dealer' } }] },
        { $or: [{ parentId: { $exists: false } }, { parentId: null }] },
      ];
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key from raw query params — JSON.stringify(filter) cannot
    // serialize RegExp (becomes {}), which made every search share one entry.
    const cacheKey = `users:${search || ''}:${role || ''}:sort:${sortBy || ''}:${sortOrder || ''}:page:${pageNum}:limit:${limitNum}`;

    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log('[Cache HIT] Users from cache');
      const cachedResponse = JSON.parse(cached);
      res.json({ ...cachedResponse, data: (cachedResponse.data || []).map(presentUser) });
      return;
    }

    // Get total count
    const total = await User.countDocuments(filter);

    // Whitelist sortable fields to prevent arbitrary field injection
    const SORTABLE_FIELDS: Record<string, 1 | -1> = {
      email: 1, name: 1, businessName: 1, role: 1, createdAt: 1, updatedAt: 1,
    };
    const sortField = (sortBy && SORTABLE_FIELDS[sortBy as string]) ? (sortBy as string) : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    // Get paginated users
    const users = await User.find(filter)
      .select('-password')
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    // Effective quota display values. User.monthlyUploadLimit is a legacy
    // field and is NOT used for enforcement — GlobalConfig is the source of
    // truth. Sub-user uploads count toward the parent account, so their row
    // shows the parent's monthly usage. Admins are unmetered.
    const GlobalConfig = (await import('../models/GlobalConfig')).default;
    const globalConfig = await (GlobalConfig as any).getConfig();
    const monthlyLimitGB = Number(globalConfig?.monthlyUploadLimitGB ?? 10);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const parentIds = [...new Set(
      users.filter((u: any) => u.parentId).map((u: any) => String(u.parentId))
    )];
    const [parents, dealerDocs] = await Promise.all([
      parentIds.length
        ? User.find({ _id: { $in: parentIds } }).select('currentMonthUpload uploadUsageMonth storageUsed role parentId').lean()
        : Promise.resolve([]),
      User.find({ role: 'dealer' }).select('_id').lean(),
    ]);
    const parentUsageById = new Map(parents.map((p: any) => [String(p._id), p]));
    const parentById = new Map(parents.map((p: any) => [String(p._id), p]));
    const dealerIds = new Set(dealerDocs.map((d: any) => String(d._id)));

    // Account origin: admin / dealer / user / d-user (dealer customer) /
    // sub-user / d-sub-user (sub-user of a dealer customer).
    const accountTypeOf = (u: any): string => {
      if (u.role === 'admin') return 'admin';
      if (u.role === 'dealer') return 'dealer';
      const parent: any = u.parentId ? parentById.get(String(u.parentId)) : null;
      if (u.role === 'sub-user') {
        return parent?.parentId && dealerIds.has(String(parent.parentId)) ? 'd-sub-user' : 'sub-user';
      }
      return parent?.role === 'dealer' ? 'd-user' : 'user';
    };

    const enrichedUsers = users.map((u: any) => {
      const presented = presentUser(u);
      const isAdmin = presented.role === 'admin';
      const isSub = isSubUserAccount(u);
      const usageSource: any = isSub ? parentUsageById.get(String(u.parentId)) : u;
      const usedBytes = usageSource && usageSource.uploadUsageMonth === currentMonth
        ? Number(usageSource.currentMonthUpload || 0)
        : 0;
      return {
        ...presented,
        accountType: accountTypeOf(u),
        monthlyUploadLimit: isAdmin ? null : monthlyLimitGB,
        currentMonthUpload: usedBytes,
        storageUsed: isSub ? Number(usageSource?.storageUsed || 0) : Number(u.storageUsed || 0),
        quotaAccountId: isSub ? String(u.parentId) : String(u._id),
      };
    });

    // Cache the result (TTL: 60 seconds)
    const response = {
      data: enrichedUsers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    };
    await cacheSet(cacheKey, JSON.stringify(response), 60);

    res.json(response);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cacheKey = `user:${req.params.id}`;

    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log('[Cache HIT] User from cache');
      res.json(presentUser(JSON.parse(cached)));
      return;
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cache the result (TTL: 300 seconds = 5 minutes)
    const response = { ...presentUser(user), accountType: await resolveAccountType(user) };
    await cacheSet(cacheKey, JSON.stringify(response), 300);

    res.json(response);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    // Quota counters (storage, monthly upload/ops) live on the OWNER account.
    // Sub-user uploads/assignments accrue to the parent, so the sub-user's own
    // counters are always 0 — show the parent's usage instead.
    const isSub = isSubUserAccount(user);
    const quotaUser = (isSub && user.parentId
      ? await User.findById(user.parentId).select('-password')
      : null) || user;
    const accountType = await resolveAccountType(user);

    const currentMonth = new Date().toISOString().slice(0, 7);
    if (quotaUser.uploadUsageMonth !== currentMonth) {
      quotaUser.uploadUsageMonth = currentMonth;
      quotaUser.currentMonthUpload = 0;
      quotaUser.monthlyUploadOps = 0;
      quotaUser.monthlyAssignOps = 0;
      await quotaUser.save();
    }
    const ownerId = req.effectiveUserId || req.userId;
    const [totalDevices, onlineDevices, config] = await Promise.all([
      Device.countDocuments({ assignedUserId: ownerId }),
      Device.countDocuments({ assignedUserId: ownerId, status: 'online' }),
      GlobalConfig.findOne(),
    ]);
    const GB = 1024 * 1024 * 1024;
    res.json({
      ...presentUser(user),
      accountType,
      isSubUser: isSub,
      quotaAccountId: String(quotaUser._id),
      totalDevices,
      onlineDevices,
      offlineDevices: Math.max(0, totalDevices - onlineDevices),
      monthlyUploadLimit: config?.monthlyUploadLimitGB ?? 10,
      usage: {
        storage: {
          usedBytes: Number(quotaUser.storageUsed || 0),
          limitBytes: Number(config?.storageLimitGB ?? 1) * GB,
          limitGB: Number(config?.storageLimitGB ?? 1),
        },
        monthlyUpload: {
          usedBytes: Number(quotaUser.currentMonthUpload || 0),
          limitBytes: Number(config?.monthlyUploadLimitGB ?? 10) * GB,
          limitGB: Number(config?.monthlyUploadLimitGB ?? 10),
        },
        uploadOps: {
          used: Number(quotaUser.monthlyUploadOps || 0),
          limit: Number(config?.monthlyUploadOpsLimit ?? 10),
        },
        assignOps: {
          used: Number(quotaUser.monthlyAssignOps || 0),
          limit: Number(config?.monthlyAssignOpsLimit ?? 15),
        },
        devices: {
          used: totalDevices,
          limit: Number(config?.maxDevicesPerUser ?? 4),
        },
        fileSizeLimitMB: Number(config?.singleUploadLimitMB ?? 500),
        resetsAt: 'month-start',
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, phone, city, businessName, role, subUserLimit, deviceLimit, userLimit, logoUrl } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!email.includes('@')) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (role && !['admin', 'user', 'dealer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin, user, or dealer' });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const effectiveRole = role || 'user';

    const userData: any = {
      email,
      password: hashedPassword,
      phone,
      city,
      businessName,
      role: effectiveRole,
    };
    if (effectiveRole === 'dealer') {
      userData.deviceLimit = Math.max(0, parseInt(deviceLimit, 10) || 0);
      userData.userLimit = Math.max(0, parseInt(userLimit, 10) || 0);
      if (logoUrl) userData.logoUrl = String(logoUrl).trim();
    } else {
      userData.subUserLimit = effectiveRole === 'admin' ? 0 : Math.max(0, parseInt(subUserLimit, 10) || 0);
    }

    const user = new User(userData);

    await user.save();

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'create_user',
        targetType: 'user',
        targetId: String(user._id),
        details: { email: user.email, role: user.role, businessName: user.businessName },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.status(201).json({
      id: user._id,
      email: user.email,
      phone: user.phone,
      businessName: user.businessName,
      role: user.role,
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, phone, city, businessName, role, subUserLimit, deviceLimit, userLimit, logoUrl } = req.body;
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (role && !['admin', 'user', 'dealer', 'sub-user'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin, user, dealer, or sub-user' });
      return;
    }
    if (isSubUserAccount(existingUser) && role && role !== 'sub-user') {
      res.status(400).json({ error: 'A sub-user cannot be changed to another role. Manage this account from its parent account.' });
      return;
    }
    if (role === 'sub-user' && !existingUser.parentId) {
      res.status(400).json({ error: 'Sub-user role can only be set through the parent account.' });
      return;
    }
    const updateData: any = {};

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        res.status(400).json({ error: 'Enter a valid email address' });
        return;
      }
      const duplicate = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: existingUser._id },
      }).select('_id');
      if (duplicate) {
        res.status(400).json({ error: 'A user with this email already exists' });
        return;
      }
      updateData.email = normalizedEmail;
    }
    if (phone) updateData.phone = phone;
    if (city !== undefined) updateData.city = city;
    if (businessName) updateData.businessName = businessName;
    if (role) updateData.role = role;

    // Role-aware limit fields: dealers carry deviceLimit/userLimit/logoUrl,
    // regular accounts carry subUserLimit. Switching roles resets the other set.
    const effectiveRole = role || existingUser.role;
    if (effectiveRole === 'dealer') {
      if (deviceLimit !== undefined) updateData.deviceLimit = Math.max(0, parseInt(deviceLimit, 10) || 0);
      if (userLimit !== undefined) updateData.userLimit = Math.max(0, parseInt(userLimit, 10) || 0);
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl ? String(logoUrl).trim() : null;
      updateData.subUserLimit = 0;
    } else {
      if (subUserLimit !== undefined) updateData.subUserLimit = Math.max(0, parseInt(subUserLimit, 10) || 0);
      if (effectiveRole !== 'dealer') {
        updateData.deviceLimit = 0;
        updateData.userLimit = 0;
        updateData.logoUrl = null;
      }
    }
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Normalize legacy child accounts the next time an admin edits them —
    // but NOT dealer customers (parentId → dealer is a legitimate account).
    if (existingUser.parentId) {
      const parent = await User.findById(existingUser.parentId).select('role').lean();
      if (parent?.role !== 'dealer') updateData.role = 'sub-user';
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');

    // Invalidate user cache on update
    await cacheDelPattern('users:*');
    await cacheDel(`user:${req.params.id}`);

    // Audit log — especially important for role changes
    if (req.userId) {
      const roleChanged = role && role !== existingUser.role;
      await AuditLog.create({
        userId: req.userId,
        action: 'update_user',
        targetType: 'user',
        targetId: req.params.id,
        details: {
          email: user?.email,
          ...(roleChanged ? { previousRole: existingUser.role, newRole: role } : {}),
          ...(subUserLimit !== undefined ? { subUserLimit } : {}),
          fieldsUpdated: Object.keys(updateData).filter((k) => k !== 'password'),
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json(presentUser(user));
  } catch (error) {
    console.error('Update user error:', error);
    if ((error as any)?.code === 11000) {
      res.status(400).json({ error: 'A user with this email already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
};

/**
 * Fully removes a user account and everything it owns: media files, device
 * configs, schedule templates, group memberships, sub-users — and, for dealer
 * accounts, the entire customer tree. Shared by admin user delete and dealer
 * customer delete so both paths clean up identically.
 */
export const purgeUserAccount = async (user: any): Promise<{ devicesUnassigned: number; mediaDeleted: number }> => {
  const io = getSocketInstance();

  // Dealer accounts own a whole customer tree — every account in the tree
  // gets the same cleanup a standalone user delete would get.
  const treeUsers = user.role === 'dealer'
    ? await User.find({ parentId: user._id, role: 'user' }).select('_id').lean()
    : [];
  const treeIdStrings = [String(user._id), ...treeUsers.map((u: any) => String(u._id))];

  let totalDevicesUnassigned = 0;
  let totalMediaDeleted = 0;

  for (const accountId of treeIdStrings) {
      const assignedDevices = await Device.find({ assignedUserId: accountId });
      const assignedDeviceIds = assignedDevices.map((device) => device.deviceId);
      const userMedia = await Media.find({ uploadedBy: accountId });
      totalDevicesUnassigned += assignedDeviceIds.length;
      totalMediaDeleted += userMedia.length;

      // Remove this account's content from stored device configs before deleting the files.
      for (const media of userMedia) {
        await getStorageService(media.storageType).delete(media.path);
        await invalidateMediaAuth(media.path);
        const devices = await Device.find({
          $or: [
            { 'config.mediaUrls': media.url },
            { 'config.sections.mediaUrls': media.url },
          ],
        });
        for (const device of devices) {
          device.config.mediaUrls = (device.config.mediaUrls || []).filter((url: string) => getMediaPathFromUrl(url) !== media.path);
          if (Array.isArray(device.config.sections)) {
            device.config.sections = device.config.sections.map((section: any) => ({
              ...section,
              mediaUrls: (section.mediaUrls || []).filter((url: string) => getMediaPathFromUrl(url) !== media.path),
              mediaItems: (section.mediaItems || []).filter((item: any) => getMediaPathFromUrl(item.url) !== media.path),
            }));
            if (device.config.layout === 'fullscreen') device.config.mediaUrls = device.config.sections[0]?.mediaUrls || [];
          }
          if (device.cacheInfo) device.cacheInfo.configVersion += 1;
          await device.save();
          await invalidateDevicePaths(device.deviceId);
          io.to(`device:${device.deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });
        }
      }

      for (const device of assignedDevices) {
        device.config = { ...device.config, layout: 'fullscreen', sections: [], mediaUrls: [], ticker: { text: '' } } as any;
        delete (device.config as any).schedule;
        if (device.cacheInfo) {
          device.cacheInfo.configVersion += 1;
          device.cacheInfo.lastSyncTime = new Date();
          device.cacheInfo.cachedMedia = [];
        }
        await device.save();
        await invalidateDevicePaths(device.deviceId);
        io.to(`device:${device.deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });
      }

      // Remove schedule templates owned by this account (and its sub-users)
      const subUserIds = await User.find({ parentId: accountId }).select('_id').lean();
      await ScheduleTemplate.deleteMany({ ownerId: { $in: [accountId, ...subUserIds.map((u: any) => u._id)] } });

      // Unassign devices and detach them from groups owned by this account.
      await Device.updateMany(
        { assignedUserId: accountId },
        { assignedUserId: undefined }
      );
      await Media.deleteMany({ uploadedBy: accountId });
      if (assignedDeviceIds.length) {
        await Group.updateMany({ devices: { $in: assignedDeviceIds } }, { $pull: { devices: { $in: assignedDeviceIds } } });
      }
      await Group.deleteMany({ ownerId: accountId });
    }

    // Delete the user(s): the account itself, its customers (dealer tree) and
    // every sub-user under any of them. Data cleanup already ran above.
    await User.deleteMany({ parentId: { $in: treeIdStrings } });
    await User.deleteMany({ _id: { $in: treeIdStrings } });

    // Invalidate user cache on delete
    await cacheDelPattern('users:*');
    for (const id of treeIdStrings) await cacheDel(`user:${id}`);

    return { devicesUnassigned: totalDevicesUnassigned, mediaDeleted: totalMediaDeleted };
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const totals = await purgeUserAccount(user);

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'delete_user',
        targetType: 'user',
        targetId: req.params.id,
        details: {
          email: user.email,
          role: user.role,
          devicesUnassigned: totals.devicesUnassigned,
          mediaDeleted: totals.mediaDeleted,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export const assignDevices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceIds } = req.body;
    const userId = req.params.id;

    if (!Array.isArray(deviceIds)) {
      res.status(400).json({ error: 'deviceIds must be an array' });
      return;
    }
    const normalizedDeviceIds = [...new Set(deviceIds.map((id: unknown) => String(id || '').trim()).filter(Boolean))];

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (isSubUserAccount(user) || user.role === 'dealer') {
      res.status(400).json({ error: 'Devices cannot be assigned to a sub-user or dealer account. Assign them to a customer account instead.' });
      return;
    }

    // Dealers may only assign devices to their own customer accounts.
    if (req.userRole === 'dealer' && (String(user.parentId || '') !== String(req.userId) || user.role !== 'user')) {
      res.status(403).json({ error: 'Devices can only be assigned to your customer accounts' });
      return;
    }

    const requestedDevices = normalizedDeviceIds.length
      ? await Device.find({ deviceId: { $in: normalizedDeviceIds } }).select('deviceId assignedUserId createdBy').lean()
      : [];
    if (requestedDevices.length !== normalizedDeviceIds.length) {
      res.status(400).json({ error: 'One or more device IDs do not exist' });
      return;
    }

    // Dealer deviceLimit caps the whole customer tree. Projected tree total =
    // current tree devices − this user's devices leaving the tree + devices
    // entering the tree from outside it.
    if (req.userRole === 'dealer' && req.scopeUserIds?.length) {
      const scopeIds = req.scopeUserIds.map(String);
      // Scope guard: a dealer may only assign devices that are already inside
      // their tree, or unassigned devices they created themselves. Devices
      // owned by other accounts (admin pool, other dealers, other customers)
      // must never be assignable by deviceId alone.
      const outOfScope = requestedDevices.filter((d: any) => {
        const owner = String(d.assignedUserId || '');
        if (owner) return !scopeIds.includes(owner);
        return String(d.createdBy || '') !== String(req.userId);
      });
      if (outOfScope.length) {
        res.status(403).json({ error: 'Devices can only be assigned from your own inventory or customer accounts' });
        return;
      }
      const dealer = await User.findById(req.userId).select('deviceLimit').lean();
      const treeLimit = Number((dealer as any)?.deviceLimit || 0);
      if (treeLimit > 0) {
        const currentTreeCount = await Device.countDocuments({
          $or: [
            { assignedUserId: { $in: scopeIds } },
            { createdBy: new mongoose.Types.ObjectId(req.userId!), assignedUserId: { $in: [...scopeIds, null] } },
          ],
        });
        const userCurrentCount = await Device.countDocuments({ assignedUserId: userId });
        const stayingCount = requestedDevices.filter((d: any) => String(d.assignedUserId || '') === userId).length;
        // Devices already inside the tree (in-scope assignees, or unassigned
        // dealer-created devices counted via createdBy) do not "enter" — only
        // devices coming from outside the tree would, and the scope guard
        // above makes those impossible.
        const enteringCount = requestedDevices.filter((d: any) => {
          const owner = String(d.assignedUserId || '');
          if (owner) return !scopeIds.includes(owner);
          return String(d.createdBy || '') !== String(req.userId);
        }).length;
        // Devices leaving this user but created by the dealer stay inside the
        // tree via createdBy even after unassignment — they must not count as
        // leaving or the projected total would under-count.
        const leavingButStillInTree = await Device.countDocuments({
          assignedUserId: userId,
          deviceId: { $nin: normalizedDeviceIds },
          createdBy: new mongoose.Types.ObjectId(req.userId!),
        });
        const leavingCount = userCurrentCount - stayingCount - leavingButStillInTree;
        const projected = currentTreeCount - leavingCount + enteringCount;
        if (projected > treeLimit) {
          res.status(400).json({
            error: `Dealer device limit reached. Your plan allows ${treeLimit} TV(s) across all customer accounts; this assignment would give the tree ${projected}. Remove a device or contact your administrator.`,
          });
          return;
        }
      }
    }

    // Per-account device limit (plan-based, admin-tunable via GlobalConfig).
    // After this save, exactly `normalizedDeviceIds.length` devices will be
    // assigned to the user (devices not in the list are unassigned below), so
    // compare the FINAL count against the limit — not current + additions,
    // which over-counts when swapping devices.
    const deviceLimit = await checkDeviceLimit(userId, 0);
    const deviceLimitValue = deviceLimit.limit || 4;
    if (normalizedDeviceIds.length > deviceLimitValue) {
      res.status(400).json({
        error: `Device limit reached. Your plan allows ${deviceLimitValue} TV(s); this assignment would give the account ${normalizedDeviceIds.length}. Remove a device or upgrade your plan.`,
      });
      return;
    }
    const transferredDeviceIds = requestedDevices
      .filter((device: any) => device.assignedUserId && String(device.assignedUserId) !== userId)
      .map((device: any) => String(device.deviceId));

    const removedDeviceIds = (user.assignedDevices || []).filter((id: string) => !normalizedDeviceIds.includes(id));
    const affectedScheduleDeviceIds = [...new Set([...transferredDeviceIds, ...removedDeviceIds])];
    if (affectedScheduleDeviceIds.length) {
      await ScheduleTemplate.deleteMany({ targetType: 'device', targetId: { $in: affectedScheduleDeviceIds } });
    }

    // Remove transferred IDs from previous owners' denormalized assignment lists.
    if (normalizedDeviceIds.length) {
      await User.updateMany(
        { _id: { $ne: userId }, assignedDevices: { $in: normalizedDeviceIds } },
        { $pull: { assignedDevices: { $in: normalizedDeviceIds } } }
      );
    }

    // Update devices to assign to this user
    await Device.updateMany(
      { deviceId: { $in: normalizedDeviceIds } },
      { assignedUserId: userId }
    );

    // Unassign devices not in the list
    await Device.updateMany(
      { assignedUserId: userId, deviceId: { $nin: normalizedDeviceIds } },
      { assignedUserId: undefined }
    );

    if (transferredDeviceIds.length) {
      await Group.updateMany({ devices: { $in: transferredDeviceIds } }, { $pull: { devices: { $in: transferredDeviceIds } } });
      await Media.updateMany({ assignedDevices: { $in: transferredDeviceIds } }, { $pull: { assignedDevices: { $in: transferredDeviceIds } } });
      const io = getSocketInstance();
      const transferredDevices = await Device.find({ deviceId: { $in: transferredDeviceIds } });
      for (const device of transferredDevices) {
        device.config = {
          ...device.config,
          layout: 'fullscreen',
          sections: [],
          mediaUrls: [],
          ticker: { text: '' },
        } as any;
        delete (device.config as any).schedule;
        if (device.cacheInfo) {
          device.cacheInfo.configVersion += 1;
          device.cacheInfo.lastSyncTime = new Date();
          device.cacheInfo.cachedMedia = [];
        }
        await device.save();
        await invalidateDevicePaths(device.deviceId);
        io.to(`device:${device.deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });
      }
    }
    user.assignedDevices = normalizedDeviceIds;
    await user.save();
    await cacheDelPattern('devices:*');
    await cacheDelPattern('groups:*');
    await cacheDelPattern('users:*');

    // Audit log for bulk device assignment
    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'assign_device',
        targetType: 'user',
        targetId: userId,
        details: {
          userEmail: user.email,
          deviceIds: normalizedDeviceIds,
          deviceCount: normalizedDeviceIds.length,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Assign devices error:', error);
    res.status(500).json({ error: 'Failed to assign devices' });
  }
};

export const getUserStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (user.uploadUsageMonth !== currentMonth) {
      user.uploadUsageMonth = currentMonth;
      user.currentMonthUpload = 0;
      await user.save();
    }

    const devices = await Device.find({ assignedUserId: userId });
    const onlineDevices = devices.filter(d => d.status === 'online').length;

    // Get global config for monthly limit
    const GlobalConfig = (await import('../models/GlobalConfig')).default;
    const config = await (GlobalConfig as any).getConfig();

    res.json({
      user,
      deviceCount: devices.length,
      onlineDeviceCount: onlineDevices,
      storageUsed: user.storageUsed,
      monthlyUploadLimit: config.monthlyUploadLimitGB,
      currentMonthUpload: user.currentMonthUpload,
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phone, businessName } = req.body;
    const updateData: any = {};

    if (phone !== undefined) updateData.phone = phone;
    if (businessName !== undefined) updateData.businessName = businessName;

    const user = await User.findByIdAndUpdate(req.userId, updateData, { new: true }).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    // Get user with password
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// ---------- Sub-users (managed by a parent 'user' account) ----------

const SUB_USER_PERMISSION_KEYS = ['devices', 'groups', 'library', 'settings'] as const;

const isParentUser = (req: AuthRequest): boolean => req.userRole === 'user' && !req.isSubUser;

/**
 * Resolve which account's sub-users may be managed by this request.
 * - 'user' role → their own account
 * - 'dealer' → one of their customer accounts (req.params.customerId)
 */
const resolveSubUserParent = async (req: AuthRequest): Promise<{ parent?: any; error?: string; status?: number }> => {
  if (isParentUser(req)) {
    const parent = await User.findById(req.userId).select('subUserLimit role');
    return { parent };
  }
  if (req.userRole === 'dealer' && req.params.customerId) {
    const parent = await User.findById(req.params.customerId).select('subUserLimit role parentId').lean();
    if (!parent || (parent as any).role !== 'user' || String((parent as any).parentId || '') !== String(req.userId)) {
      return { error: 'Sub-users can only be managed for your customer accounts', status: 403 };
    }
    return { parent };
  }
  return { error: 'Only account owners can manage sub-users', status: 403 };
};

const sanitizePermissions = (input: any) => {
  const permissions: Record<string, boolean> = {};
  for (const key of SUB_USER_PERMISSION_KEYS) {
    permissions[key] = input?.[key] !== false;
  }
  // Sub-users can never manage sub-users themselves.
  permissions.subUsers = false;
  return permissions;
};

const sanitizeResourceAccess = (input: any): { devices: string[]; groups: string[] } => {
  const normalizeIds = (value: any): string[] => Array.from(new Set<string>(
    (Array.isArray(value) ? value : [])
      .map((id: any) => String(id || '').trim())
      .filter(Boolean)
  ));
  return { devices: normalizeIds(input?.devices), groups: normalizeIds(input?.groups) };
};

const validateResourceAccess = async (parentId: string, access: { devices: string[]; groups: string[] }): Promise<string | null> => {
  const [devices, groups] = await Promise.all([
    access.devices.length
      ? Device.find({ deviceId: { $in: access.devices }, assignedUserId: parentId }).select('deviceId').lean()
      : [],
    access.groups.length
      ? Group.find({ _id: { $in: access.groups }, ownerId: parentId }).select('_id').lean()
      : [],
  ]);
  if (devices.length !== access.devices.length) return 'One or more selected devices do not belong to your account';
  if (groups.length !== access.groups.length) return 'One or more selected groups do not belong to your account';
  return null;
};

export const getSubUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parent, error, status } = await resolveSubUserParent(req);
    if (!parent) {
      res.status(status || 403).json({ error: error || 'Only account owners can manage sub-users' });
      return;
    }
    const subUsers = await User.find({ parentId: parent._id }).select('-password').sort({ createdAt: -1 });
    // Sub-users of a dealer customer are 'd-sub-user'; of a normal user 'sub-user'.
    let accountType = 'sub-user';
    if (parent.parentId) {
      const grand = await User.findById(parent.parentId).select('role').lean();
      if ((grand as any)?.role === 'dealer') accountType = 'd-sub-user';
    }
    res.json({
      data: subUsers.map((su: any) => ({ ...presentUser(su), accountType })),
      limit: parent.subUserLimit || 0,
      count: subUsers.length,
    });
  } catch (error) {
    console.error('Get sub-users error:', error);
    res.status(500).json({ error: 'Failed to fetch sub-users' });
  }
};

export const createSubUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parent, error, status } = await resolveSubUserParent(req);
    if (!parent) {
      res.status(status || 403).json({ error: error || 'Only account owners can manage sub-users' });
      return;
    }
    const { email, password, permissions, resourceAccess } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (!String(email).includes('@')) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const limit = Number(parent.subUserLimit || 0);
    const existingCount = await User.countDocuments({ parentId: parent._id });
    if (limit <= 0 || existingCount >= limit) {
      res.status(400).json({ error: `Sub-user limit reached (${existingCount}/${limit}). Ask admin to increase the limit.` });
      return;
    }
    const safeResourceAccess = sanitizeResourceAccess(resourceAccess);
    const resourceAccessError = await validateResourceAccess(String(parent._id), safeResourceAccess);
    if (resourceAccessError) {
      res.status(403).json({ error: resourceAccessError });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(400).json({ error: 'A user with this email already exists' });
      return;
    }

    const subUser = new User({
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      role: 'sub-user',
      parentId: parent._id,
      permissions: sanitizePermissions(permissions),
      resourceAccess: safeResourceAccess,
      subUserLimit: 0,
    });
    await subUser.save();

    await cacheDelPattern('users:*');
    res.status(201).json({ id: subUser._id, email: subUser.email, role: 'sub-user', permissions: subUser.permissions });
  } catch (error) {
    console.error('Create sub-user error:', error);
    res.status(500).json({ error: 'Failed to create sub-user' });
  }
};

export const updateSubUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parent, error, status } = await resolveSubUserParent(req);
    if (!parent) {
      res.status(status || 403).json({ error: error || 'Only account owners can manage sub-users' });
      return;
    }
    const subUser = await User.findOne({ _id: req.params.id, parentId: parent._id });
    if (!subUser) {
      res.status(404).json({ error: 'Sub-user not found' });
      return;
    }

    const { email, password, permissions, resourceAccess } = req.body;
    subUser.role = 'sub-user';
    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail.includes('@')) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      const duplicate = await User.findOne({ email: normalizedEmail, _id: { $ne: subUser._id } });
      if (duplicate) {
        res.status(400).json({ error: 'A user with this email already exists' });
        return;
      }
      subUser.email = normalizedEmail;
    }
    if (password) {
      if (String(password).length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      subUser.password = await bcrypt.hash(password, 10);
    }
    if (permissions !== undefined) {
      subUser.permissions = sanitizePermissions(permissions);
    }
    if (resourceAccess !== undefined) {
      const safeResourceAccess = sanitizeResourceAccess(resourceAccess);
      const resourceAccessError = await validateResourceAccess(String(parent._id), safeResourceAccess);
      if (resourceAccessError) {
        res.status(403).json({ error: resourceAccessError });
        return;
      }
      subUser.resourceAccess = safeResourceAccess as any;
    }
    await subUser.save();

    await cacheDelPattern('users:*');
    res.json({ id: subUser._id, email: subUser.email, role: 'sub-user', permissions: subUser.permissions });
  } catch (error) {
    console.error('Update sub-user error:', error);
    if ((error as any)?.code === 11000) {
      res.status(400).json({ error: 'A user with this email already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to update sub-user' });
  }
};

export const deleteSubUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parent, error, status } = await resolveSubUserParent(req);
    if (!parent) {
      res.status(status || 403).json({ error: error || 'Only account owners can manage sub-users' });
      return;
    }
    const subUser = await User.findOne({ _id: req.params.id, parentId: parent._id });
    if (!subUser) {
      res.status(404).json({ error: 'Sub-user not found' });
      return;
    }
    // Sub-user uploads are attributed to the parent account, so no media cleanup is needed here.
    await User.findByIdAndDelete(subUser._id);
    await cacheDelPattern('users:*');
    res.json({ success: true });
  } catch (error) {
    console.error('Delete sub-user error:', error);
    res.status(500).json({ error: 'Failed to delete sub-user' });
  }
};
