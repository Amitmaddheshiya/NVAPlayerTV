import { Response } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User';
import Device from '../models/Device';
import Media from '../models/Media';
import AuditLog from '../models/AuditLog';
import { purgeUserAccount } from './user.controller';
import { invalidateDealerScope } from '../utils/dealerScope';
import { cacheDel, cacheDelPattern } from '../config/redis';
import GlobalConfig from '../models/GlobalConfig';

/**
 * Dealer (sub-admin) endpoints. A dealer only ever sees and manages accounts
 * in their own tree: themselves + customer accounts (role 'user', parentId =
 * dealer). req.scopeUserIds is populated by the auth middleware.
 */

const scopeIds = (req: AuthRequest): string[] => (req.scopeUserIds || []).map(String);

const findOwnCustomer = async (req: AuthRequest, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return User.findOne({ _id: id, parentId: req.userId, role: 'user' });
};

export const getDealerDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ids = scopeIds(req);
    const dealer = await User.findById(req.userId).select('deviceLimit userLimit businessName logoUrl').lean();

    const [customerCount, subUserCount, deviceStats, mediaStats, recentUploads] = await Promise.all([
      User.countDocuments({ parentId: req.userId, role: 'user' }),
      User.countDocuments({ parentId: { $in: ids }, role: 'sub-user' }),
      Device.aggregate([
        { $match: { $or: [
          { assignedUserId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } },
          { createdBy: new mongoose.Types.ObjectId(String(req.userId)), assignedUserId: { $in: [...ids.map((id) => new mongoose.Types.ObjectId(id)), null] } },
        ] } },
        { $group: { _id: null, total: { $sum: 1 }, online: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } } } },
      ]),
      Media.aggregate([
        { $match: { uploadedBy: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, deletedFromLibrary: { $ne: true } } },
        { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$size', 0] } } } },
      ]),
      Media.find({ uploadedBy: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, deletedFromLibrary: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('originalName size createdAt')
        .lean(),
    ]);

    const devices = deviceStats[0] || { total: 0, online: 0 };
    const media = mediaStats[0] || { count: 0, bytes: 0 };

    res.json({
      dealer: {
        id: req.userId,
        businessName: (dealer as any)?.businessName || '',
        deviceLimit: Number((dealer as any)?.deviceLimit || 0),
        userLimit: Number((dealer as any)?.userLimit || 0),
        logoUrl: (dealer as any)?.logoUrl || null,
      },
      customers: customerCount,
      users: { customers: customerCount, subUsers: subUserCount, total: customerCount + subUserCount },
      devices: { total: devices.total, online: devices.online, offline: devices.total - devices.online },
      media: { count: media.count, bytesUsed: media.bytes },
      recentUploads: recentUploads,
    });
  } catch (error) {
    console.error('Dealer dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dealer dashboard' });
  }
};

export const getDealerCustomers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const filter: any = { parentId: req.userId, role: 'user' };
    if (search) {
      const regex = new RegExp(String(search), 'i');
      filter.$or = [{ email: regex }, { businessName: regex }, { phone: regex }];
    }
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const [total, customers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('email phone city businessName subUserLimit storageUsed createdAt')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const customerIds = customers.map((c: any) => String(c._id));
    const deviceCounts = customerIds.length
      ? await Device.aggregate([
          { $match: { assignedUserId: { $in: customerIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
          { $group: { _id: '$assignedUserId', count: { $sum: 1 } } },
        ])
      : [];
    const countByUser = new Map(deviceCounts.map((d: any) => [String(d._id), d.count]));

    res.json({
      data: customers.map((c: any) => ({
        ...c,
        deviceCount: countByUser.get(String(c._id)) || 0,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Dealer customers list error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const createDealerCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, phone, city, businessName, subUserLimit } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(String(email))) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Dealer userLimit caps how many customer accounts the dealer may create.
    const dealer = await User.findById(req.userId).select('userLimit').lean();
    const userLimit = Number((dealer as any)?.userLimit || 0);
    if (userLimit > 0) {
      const customerCount = await User.countDocuments({ parentId: req.userId, role: 'user' });
      if (customerCount >= userLimit) {
        res.status(400).json({
          error: `Customer limit reached. Your plan allows ${userLimit} customer account(s); you currently have ${customerCount}. Contact your administrator to add more.`,
        });
        return;
      }
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const customer = new User({
      email: String(email).toLowerCase(),
      password: await bcrypt.hash(String(password), 10),
      phone,
      city,
      businessName,
      role: 'user',
      parentId: req.userId,
      subUserLimit: Math.max(0, parseInt(subUserLimit, 10) || 0),
    });
    await customer.save();
    await invalidateDealerScope(req.userId);
    await cacheDelPattern('users:*');

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'create_user',
        targetType: 'user',
        targetId: String(customer._id),
        details: { email: customer.email, businessName: customer.businessName },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.status(201).json({
      id: customer._id,
      email: customer.email,
      phone: customer.phone,
      businessName: customer.businessName,
      role: customer.role,
      subUserLimit: customer.subUserLimit,
    });
  } catch (error) {
    console.error('Dealer create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateDealerCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customer = await findOwnCustomer(req, req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const { email, password, phone, city, businessName, subUserLimit } = req.body;
    const updateData: any = {};

    if (email !== undefined) {
      const normalized = String(email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalized)) {
        res.status(400).json({ error: 'Enter a valid email address' });
        return;
      }
      const duplicate = await User.findOne({ email: normalized, _id: { $ne: customer._id } }).select('_id');
      if (duplicate) {
        res.status(400).json({ error: 'A user with this email already exists' });
        return;
      }
      updateData.email = normalized;
    }
    if (phone !== undefined) updateData.phone = phone;
    if (city !== undefined) updateData.city = city;
    if (businessName !== undefined) updateData.businessName = businessName;
    if (subUserLimit !== undefined) updateData.subUserLimit = Math.max(0, parseInt(subUserLimit, 10) || 0);
    if (password) {
      if (String(password).length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      updateData.password = await bcrypt.hash(String(password), 10);
    }

    const updated = await User.findByIdAndUpdate(customer._id, updateData, { new: true }).select('-password');
    await cacheDelPattern('users:*');
    await cacheDel(`user:${customer._id}`);

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'update_user',
        targetType: 'user',
        targetId: String(customer._id),
        details: { fieldsUpdated: Object.keys(updateData).filter((k) => k !== 'password') },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Dealer update customer error:', error);
    if ((error as any)?.code === 11000) {
      res.status(400).json({ error: 'A user with this email already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const deleteDealerCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customer = await findOwnCustomer(req, req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const totals = await purgeUserAccount(customer);
    await invalidateDealerScope(req.userId);
    await cacheDelPattern('users:*');

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'delete_user',
        targetType: 'user',
        targetId: String(customer._id),
        details: {
          email: customer.email,
          devicesUnassigned: totals.devicesUnassigned,
          mediaDeleted: totals.mediaDeleted,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Dealer delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

const presentDealerUser = (user: any): any => {
  const value = typeof user?.toObject === 'function' ? user.toObject() : user;
  return value ? { ...value, role: user?.role === 'sub-user' ? 'sub-user' : value.role } : value;
};

/**
 * Admin-parity user list scoped to the dealer tree: customer accounts
 * (role 'user', parentId = dealer) plus their sub-users (role 'sub-user',
 * parentId = a customer). Same enrichment as admin getUsers — storage,
 * device count, monthly upload quota display.
 */
export const getDealerUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '15', search, role, sortBy, sortOrder } = req.query;
    const ids = scopeIds(req);
    if (!ids.length) {
      res.json({ data: [], total: 0, page: 1, limit: 15, totalPages: 0 });
      return;
    }

    const scopeObjectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const filter: any = { parentId: { $in: scopeObjectIds } };

    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      filter.$or = [{ email: searchRegex }, { businessName: searchRegex }, { phone: searchRegex }];
    }
    if (role === 'user') {
      filter.role = 'user';
      filter.parentId = req.userId;
    } else if (role === 'sub-user') {
      filter.role = 'sub-user';
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 15));
    const skip = (pageNum - 1) * limitNum;

    const SORTABLE_FIELDS: Record<string, 1 | -1> = {
      email: 1, name: 1, businessName: 1, role: 1, createdAt: 1, updatedAt: 1,
    };
    const sortField = (sortBy && SORTABLE_FIELDS[sortBy as string]) ? (sortBy as string) : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-password')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum),
    ]);

    // Device counts per user (assignedDevices array length is also present,
    // but the aggregate matches admin behaviour exactly).
    const userIds = users.map((u: any) => u._id);
    const deviceCounts = userIds.length
      ? await Device.aggregate([
          { $match: { assignedUserId: { $in: userIds } } },
          { $group: { _id: '$assignedUserId', count: { $sum: 1 } } },
        ])
      : [];
    const deviceCountByUser = new Map(deviceCounts.map((d: any) => [String(d._id), d.count]));

    // Monthly upload quota display — same rules as admin getUsers.
    const globalConfig = await (GlobalConfig as any).getConfig();
    const monthlyLimitGB = Number(globalConfig?.monthlyUploadLimitGB ?? 10);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const parentIds = [...new Set(
      users.filter((u: any) => u.parentId).map((u: any) => String(u.parentId))
    )];
    const parents = parentIds.length
      ? await User.find({ _id: { $in: parentIds } }).select('currentMonthUpload uploadUsageMonth storageUsed').lean()
      : [];
    const parentUsageById = new Map(parents.map((p: any) => [String(p._id), p]));

    const enrichedUsers = users.map((u: any) => {
      const presented = presentDealerUser(u);
      const isSub = u.role === 'sub-user';
      const usageSource: any = isSub ? parentUsageById.get(String(u.parentId)) : u;
      const usedBytes = usageSource && usageSource.uploadUsageMonth === currentMonth
        ? Number(usageSource.currentMonthUpload || 0)
        : 0;
      return {
        ...presented,
        accountType: isSub ? 'd-sub-user' : 'd-user',
        deviceCount: deviceCountByUser.get(String(u._id)) || 0,
        monthlyUploadLimit: monthlyLimitGB,
        currentMonthUpload: usedBytes,
        storageUsed: isSub ? Number(usageSource?.storageUsed || 0) : Number(u.storageUsed || 0),
        quotaAccountId: isSub ? String(u.parentId) : String(u._id),
      };
    });

    res.json({
      data: enrichedUsers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Dealer users list error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/** Single user inside the dealer tree (customer or sub-user). */
export const getDealerUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ids = scopeIds(req);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = await User.findOne({
      _id: req.params.id,
      parentId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    }).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ...presentDealerUser(user), accountType: user.role === 'sub-user' ? 'd-sub-user' : 'd-user' });
  } catch (error) {
    console.error('Dealer get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const updateDealerProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { businessName, phone, city } = req.body;
    const updateData: any = {};
    if (businessName !== undefined) updateData.businessName = businessName;
    if (phone !== undefined) updateData.phone = phone;
    if (city !== undefined) updateData.city = city;

    const user = await User.findByIdAndUpdate(req.userId, updateData, { new: true }).select('-password');
    if (!user) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error('Dealer profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};
