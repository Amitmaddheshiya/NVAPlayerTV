import { Request, Response } from 'express';
import User from '../models/User';
import Device from '../models/Device';
import Media from '../models/Media';
import Group from '../models/Group';
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

const isSubUserAccount = (user: any): boolean => user?.role === 'sub-user' || !!user?.parentId;
const presentUser = (user: any): any => {
  const value = typeof user?.toObject === 'function' ? user.toObject() : user;
  return value ? { ...value, role: isSubUserAccount(value) ? 'sub-user' : value.role } : value;
};

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '10', search, role } = req.query;
    const filter: any = {};

    // Search filter - search in email, name
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      filter.$or = [
        { email: searchRegex },
        { name: searchRegex }
      ];
    }

    // Role filter
    if (role === 'sub-user') {
      filter.$and = [{ $or: [{ role: 'sub-user' }, { parentId: { $exists: true, $ne: null } }] }];
    } else if (role === 'user') {
      // Legacy child accounts may still have role=user; keep them in the Sub-user filter.
      filter.$and = [{ role: 'user' }, { parentId: null }];
    } else if (role) {
      filter.role = role;
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key from raw query params — JSON.stringify(filter) cannot
    // serialize RegExp (becomes {}), which made every search share one entry.
    const cacheKey = `users:${search || ''}:${role || ''}:page:${pageNum}:limit:${limitNum}`;

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

    // Get paginated users
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    // Cache the result (TTL: 60 seconds)
    const response = {
      data: users.map(presentUser),
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
    const response = presentUser(user);
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
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (user.uploadUsageMonth !== currentMonth) {
      user.uploadUsageMonth = currentMonth;
      user.currentMonthUpload = 0;
      user.monthlyUploadOps = 0;
      user.monthlyAssignOps = 0;
      await user.save();
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
      isSubUser: isSubUserAccount(user),
      totalDevices,
      onlineDevices,
      offlineDevices: Math.max(0, totalDevices - onlineDevices),
      monthlyUploadLimit: config?.monthlyUploadLimitGB ?? 10,
      usage: {
        storage: {
          usedBytes: Number(user.storageUsed || 0),
          limitBytes: Number(config?.storageLimitGB ?? 1) * GB,
          limitGB: Number(config?.storageLimitGB ?? 1),
        },
        monthlyUpload: {
          usedBytes: Number(user.currentMonthUpload || 0),
          limitBytes: Number(config?.monthlyUploadLimitGB ?? 10) * GB,
          limitGB: Number(config?.monthlyUploadLimitGB ?? 10),
        },
        uploadOps: {
          used: Number(user.monthlyUploadOps || 0),
          limit: Number(config?.monthlyUploadOpsLimit ?? 10),
        },
        assignOps: {
          used: Number(user.monthlyAssignOps || 0),
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
    const { email, password, phone, businessName, role, subUserLimit } = req.body;

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

    if (role && !['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin or user' });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword,
      phone,
      businessName,
      role: role || 'user',
      subUserLimit: role === 'admin' ? 0 : Math.max(0, parseInt(subUserLimit, 10) || 0),
    });

    await user.save();

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
    const { email, password, phone, businessName, role, subUserLimit } = req.body;
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (role && !['admin', 'user', 'sub-user'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin, user, or sub-user' });
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
    if (businessName) updateData.businessName = businessName;
    if (role) updateData.role = role;
    if (subUserLimit !== undefined) updateData.subUserLimit = Math.max(0, parseInt(subUserLimit, 10) || 0);
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Normalize legacy child accounts the next time an admin edits them.
    if (existingUser.parentId) updateData.role = 'sub-user';
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');

    // Invalidate user cache on update
    await cacheDelPattern('users:*');
    await cacheDel(`user:${req.params.id}`);

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

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const assignedDevices = await Device.find({ assignedUserId: req.params.id });
    const assignedDeviceIds = assignedDevices.map((device) => device.deviceId);
    const userMedia = await Media.find({ uploadedBy: req.params.id });
    const storage = getStorageService();
    const io = getSocketInstance();

    // Remove this user's content from stored device configs before deleting the files.
    for (const media of userMedia) {
      await storage.delete(media.path);
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
    const subUserIds = await User.find({ parentId: req.params.id }).select('_id').lean();
    await ScheduleTemplate.deleteMany({ ownerId: { $in: [req.params.id, ...subUserIds.map((u: any) => u._id)] } });

    // Unassign devices and detach them from groups owned by this account.
    await Device.updateMany(
      { assignedUserId: req.params.id },
      { assignedUserId: undefined }
    );
    await Media.deleteMany({ uploadedBy: req.params.id });
    if (assignedDeviceIds.length) {
      await Group.updateMany({ devices: { $in: assignedDeviceIds } }, { $pull: { devices: { $in: assignedDeviceIds } } });
    }
    await Group.deleteMany({ ownerId: req.params.id });

    // Delete the user (and any sub-users they created)
    await User.deleteMany({ parentId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    // Invalidate user cache on delete
    await cacheDelPattern('users:*');
    await cacheDel(`user:${req.params.id}`);

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
    if (isSubUserAccount(user)) {
      res.status(400).json({ error: 'Devices cannot be assigned to a sub-user. Assign them to the parent account instead.' });
      return;
    }

    const requestedDevices = normalizedDeviceIds.length
      ? await Device.find({ deviceId: { $in: normalizedDeviceIds } }).select('deviceId assignedUserId').lean()
      : [];
    if (requestedDevices.length !== normalizedDeviceIds.length) {
      res.status(400).json({ error: 'One or more device IDs do not exist' });
      return;
    }

    // Per-account device limit (plan-based, admin-tunable via GlobalConfig).
    // Count only NEWLY added devices — devices already assigned to this user
    // don't consume extra quota when the list is re-saved.
    const deviceLimit = await checkDeviceLimit(userId, 0);
    if (!deviceLimit.ok) {
      res.status(400).json({ error: deviceLimit.error });
      return;
    }
    const currentlyAssigned = await Device.countDocuments({ assignedUserId: userId });
    const newAssignments = normalizedDeviceIds.filter((id: string) =>
      !requestedDevices.find((d: any) => String(d.deviceId) === id && String(d.assignedUserId) === userId)
    );
    if (currentlyAssigned + newAssignments.length > (deviceLimit.limit || 4)) {
      res.status(400).json({
        error: `Device limit reached. Your plan allows ${deviceLimit.limit} TV(s); this account already has ${currentlyAssigned}. Remove a device or upgrade your plan.`,
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
    if (!isParentUser(req)) {
      res.status(403).json({ error: 'Only account owners can manage sub-users' });
      return;
    }
    const parent = await User.findById(req.userId).select('subUserLimit');
    const subUsers = await User.find({ parentId: req.userId }).select('-password').sort({ createdAt: -1 });
    res.json({ data: subUsers.map(presentUser), limit: parent?.subUserLimit || 0, count: subUsers.length });
  } catch (error) {
    console.error('Get sub-users error:', error);
    res.status(500).json({ error: 'Failed to fetch sub-users' });
  }
};

export const createSubUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isParentUser(req)) {
      res.status(403).json({ error: 'Only account owners can manage sub-users' });
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

    const parent = await User.findById(req.userId);
    if (!parent) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const limit = Number(parent.subUserLimit || 0);
    const existingCount = await User.countDocuments({ parentId: req.userId });
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
      parentId: req.userId,
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
    if (!isParentUser(req)) {
      res.status(403).json({ error: 'Only account owners can manage sub-users' });
      return;
    }
    const subUser = await User.findOne({ _id: req.params.id, parentId: req.userId });
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
      const resourceAccessError = await validateResourceAccess(String(req.userId), safeResourceAccess);
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
    if (!isParentUser(req)) {
      res.status(403).json({ error: 'Only account owners can manage sub-users' });
      return;
    }
    const subUser = await User.findOne({ _id: req.params.id, parentId: req.userId });
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
