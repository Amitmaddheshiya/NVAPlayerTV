import { Request, Response } from 'express';
import User from '../models/User';
import Device from '../models/Device';
import Media from '../models/Media';
import Group from '../models/Group';
import GlobalConfig from '../models/GlobalConfig';
import { getStorageService } from '../config/storage';
import { getSocketInstance } from '../socket/socket';
import { getMediaPathFromUrl } from '../utils/mediaUrl';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from '../config/redis';

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
    if (role) {
      filter.role = role;
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on filter and pagination
    const cacheKey = `users:${JSON.stringify(filter)}:page:${pageNum}:limit:${limitNum}`;

    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log('[Cache HIT] Users from cache');
      res.json(JSON.parse(cached));
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
    await cacheSet(cacheKey, JSON.stringify({
      data: users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }), 60);

    res.json({
      data: users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    });
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
      res.json(JSON.parse(cached));
      return;
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cache the result (TTL: 300 seconds = 5 minutes)
    await cacheSet(cacheKey, JSON.stringify(user), 300);

    res.json(user);
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
      await user.save();
    }
    const [totalDevices, onlineDevices, config] = await Promise.all([
      Device.countDocuments({ assignedUserId: req.userId }),
      Device.countDocuments({ assignedUserId: req.userId, status: 'online' }),
      GlobalConfig.findOne().select('monthlyUploadLimitGB'),
    ]);
    res.json({
      ...user.toObject(),
      totalDevices,
      onlineDevices,
      offlineDevices: Math.max(0, totalDevices - onlineDevices),
      monthlyUploadLimit: config?.monthlyUploadLimitGB ?? 10,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, phone, businessName, role } = req.body;

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
    const { email, password, phone, businessName, role } = req.body;
    const updateData: any = {};

    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (businessName) updateData.businessName = businessName;
    if (role) updateData.role = role;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Invalidate user cache on update
    await cacheDelPattern('users:*');
    await cacheDel(`user:${req.params.id}`);

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
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
        io.to(`device:${device.deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });
      }
    }

    for (const device of assignedDevices) {
      device.config = { ...device.config, layout: 'fullscreen', sections: [], mediaUrls: [], ticker: { text: '' } } as any;
      if (device.cacheInfo) {
        device.cacheInfo.configVersion += 1;
        device.cacheInfo.lastSyncTime = new Date();
        device.cacheInfo.cachedMedia = [];
      }
      await device.save();
      io.to(`device:${device.deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });
    }

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

    // Delete the user
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

    const requestedDevices = normalizedDeviceIds.length
      ? await Device.find({ deviceId: { $in: normalizedDeviceIds } }).select('deviceId assignedUserId').lean()
      : [];
    if (requestedDevices.length !== normalizedDeviceIds.length) {
      res.status(400).json({ error: 'One or more device IDs do not exist' });
      return;
    }
    const transferredDeviceIds = requestedDevices
      .filter((device: any) => device.assignedUserId && String(device.assignedUserId) !== userId)
      .map((device: any) => String(device.deviceId));

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
        if (device.cacheInfo) {
          device.cacheInfo.configVersion += 1;
          device.cacheInfo.lastSyncTime = new Date();
          device.cacheInfo.cachedMedia = [];
        }
        await device.save();
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
