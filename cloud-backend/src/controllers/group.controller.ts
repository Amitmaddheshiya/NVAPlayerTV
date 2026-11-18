import { Request, Response } from 'express';
import Group from '../models/Group';
import Device from '../models/Device';
import Media from '../models/Media';
import AuditLog from '../models/AuditLog';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { getSocketInstance } from '../socket/socket';
import mongoose from 'mongoose';
import { cacheGet, cacheSet, cacheDelPattern } from '../config/redis';
import env from '../config/env';
import { getMediaPathFromUrl } from '../utils/mediaUrl';

export const getGroups = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '10', search } = req.query;
    const filter: any = {};

    // Search filter - search in group name
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      filter.name = searchRegex;
    }

    let userDeviceIds: string[] | null = null;
    if (req.userRole !== 'admin') {
      const assignedDevices = await Device.find({ assignedUserId: req.userId }).select('deviceId').lean();
      userDeviceIds = assignedDevices.map((device: any) => String(device.deviceId));
      const ownershipClauses: any[] = [{ ownerId: req.userId }];
      if (userDeviceIds.length) {
        ownershipClauses.push({
          ownerId: { $exists: false },
          devices: { $ne: [], $not: { $elemMatch: { $nin: userDeviceIds } } },
        });
      }
      filter.$and = [
        ...(filter.name ? [{ name: filter.name }] : []),
        { $or: ownershipClauses },
      ];
      delete filter.name;
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on filter and pagination
    const cacheKey = `groups:${req.userId || 'admin'}:${JSON.stringify(filter)}:page:${pageNum}:limit:${limitNum}`;

    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log('[Cache HIT] Groups from cache');
      res.json(JSON.parse(cached));
      return;
    }

    // Get total count
    const total = await Group.countDocuments(filter);

    // Return groups with filter applied
    let groups = await Group.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    // Cache the result (TTL: 60 seconds)
    await cacheSet(cacheKey, JSON.stringify({
      data: groups,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }), 60);

    res.json({
      data: groups,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, devices } = req.body;

    console.log('Create group request:', { name, devices, userId: req.userId, userRole: req.userRole });

    // Validation
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }

    if (name.length < 2) {
      res.status(400).json({ error: 'Group name must be at least 2 characters' });
      return;
    }

    if (devices && !Array.isArray(devices)) {
      res.status(400).json({ error: 'Devices must be an array' });
      return;
    }

    const existingGroup = await Group.findOne({ name });
    if (existingGroup) {
      res.status(400).json({ error: 'Group already exists' });
      return;
    }

    if (req.userRole !== 'admin') {
      const allowed = await Device.find({ deviceId: { $in: devices || [] }, assignedUserId: req.userId }).select('deviceId').lean();
      if (allowed.length !== (devices || []).length) {
        res.status(403).json({ error: 'Groups can only contain devices assigned to your account' });
        return;
      }
    }

    const group = new Group({
      name: name.trim(),
      devices: devices || [],
      ownerId: req.userRole === 'admin' ? undefined : req.userId,
    });

    await group.save();
    console.log('Group created successfully:', group);

    // Invalidate group cache on create
    await cacheDelPattern('groups:*');
    await cacheDelPattern('devices:*');

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

export const updateGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, devices } = req.body;
    const group = await Group.findById(req.params.id);

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    if (req.userRole !== 'admin') {
      const ownsLegacyGroup = !group.ownerId && group.devices.length > 0 &&
        (await Device.countDocuments({ deviceId: { $in: group.devices }, assignedUserId: req.userId })) === group.devices.length;
      if (group.ownerId?.toString() !== req.userId && !ownsLegacyGroup) {
        res.status(403).json({ error: 'Access denied: group does not belong to your account' });
        return;
      }
      const allowed = await Device.find({ deviceId: { $in: devices || [] }, assignedUserId: req.userId }).select('deviceId').lean();
      if (allowed.length !== (devices || []).length) {
        res.status(403).json({ error: 'Groups can only contain devices assigned to your account' });
        return;
      }
      group.ownerId = new mongoose.Types.ObjectId(req.userId);
    }
    if (name !== undefined) group.name = String(name).trim();
    if (devices !== undefined) group.devices = devices;
    await group.save();

    // Invalidate group cache on update
    await cacheDelPattern('groups:*');
    await cacheDelPattern('devices:*');

    res.json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    const ownsLegacyGroup = req.userRole !== 'admin' && !group.ownerId && group.devices.length > 0 &&
      (await Device.countDocuments({ deviceId: { $in: group.devices }, assignedUserId: req.userId })) === group.devices.length;
    if (req.userRole !== 'admin' && group.ownerId?.toString() !== req.userId && !ownsLegacyGroup) {
      res.status(403).json({ error: 'Access denied: group does not belong to your account' });
      return;
    }
    await group.deleteOne();

    // Invalidate group cache on delete
    await cacheDelPattern('groups:*');
    await cacheDelPattern('devices:*');

    res.json({ success: true });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

export const configureGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id;
    const { config: submittedConfig } = req.body;
    if (!submittedConfig || typeof submittedConfig !== 'object') {
      res.status(400).json({ error: 'Valid configuration is required' });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    const ownsLegacyGroup = req.userRole !== 'admin' && !group.ownerId && group.devices.length > 0 &&
      (await Device.countDocuments({ deviceId: { $in: group.devices }, assignedUserId: req.userId })) === group.devices.length;
    if (req.userRole !== 'admin' && group.ownerId?.toString() !== req.userId && !ownsLegacyGroup) {
      res.status(403).json({ error: 'Access denied: group does not belong to your account' });
      return;
    }

    // Get all devices in this group
    const deviceFilter: any = { deviceId: { $in: group.devices } };
    if (req.userRole !== 'admin') deviceFilter.assignedUserId = req.userId;
    const devices = await Device.find(deviceFilter);
    if (devices.length !== group.devices.length) {
      res.status(403).json({ error: 'One or more group devices are not assigned to your account' });
      return;
    }

    if (devices.length === 0) {
      res.status(400).json({ error: 'No devices in this group' });
      return;
    }

    const mediaPaths = (Array.isArray(submittedConfig.sections) ? submittedConfig.sections : [])
      .flatMap((section: any) => section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : [])
      .map((value: string) => getMediaPathFromUrl(value))
      .filter((path: string | null): path is string => !!path);
    const uniqueMediaPaths = [...new Set(mediaPaths)];
    const mediaDocs = uniqueMediaPaths.length
      ? await Media.find({ path: { $in: uniqueMediaPaths } }).select('path originalName filename mimeType size hash updatedAt createdAt uploadedBy').lean()
      : [];
    if (mediaDocs.length !== uniqueMediaPaths.length) {
      res.status(400).json({ error: 'Configuration contains a media file that no longer exists' });
      return;
    }
    if (req.userRole !== 'admin' && mediaDocs.some((media: any) => media.uploadedBy?.toString() !== req.userId)) {
      res.status(403).json({ error: 'Configuration can only use media uploaded to your account' });
      return;
    }
    const mediaByPath = new Map(mediaDocs.map((media: any) => [String(media.path), media]));
    const config = {
      ...submittedConfig,
      sections: Array.isArray(submittedConfig.sections)
        ? submittedConfig.sections.map((section: any) => {
            if (section?.contentType !== 'multimedia' || !Array.isArray(section.mediaUrls)) return section;
            const mediaUrls = section.mediaUrls.map((value: string) =>
              value.startsWith('/api/media/file/') ? `${env.SERVER_URL}${value}` : value
            );
            const mediaItems = mediaUrls.map((url: string) => {
              const mediaPath = getMediaPathFromUrl(url);
              const media: any = mediaPath ? mediaByPath.get(mediaPath) : null;
              return media ? {
                url,
                name: media.filename || media.originalName,
                originalName: media.originalName,
                type: media.mimeType,
                size: Number(media.size || 0),
                hash: media.hash,
                mtimeMs: Number(media.updatedAt?.getTime?.() || media.createdAt?.getTime?.() || 0),
              } : { url };
            });
            return { ...section, mediaUrls, mediaItems };
          })
        : [],
    };
    if (config.layout === 'fullscreen') {
      const firstSection = config.sections[0];
      config.mediaUrls = firstSection?.contentType === 'multimedia' ? firstSection.mediaUrls : [];
    } else {
      config.mediaUrls = [];
    }

    // Collect all media URLs from config
    const allMediaUrls: string[] = [];
    if (config.sections && Array.isArray(config.sections)) {
      config.sections.forEach((section: any) => {
        if (section.contentType === 'multimedia' && section.mediaUrls) {
          allMediaUrls.push(...section.mediaUrls);
        }
      });
    }

    // Apply config to each device in the group
    const io = getSocketInstance();
    const updatePromises = devices.map(async (device) => {
      // Store previous config for audit
      const previousConfig = device.config ? { ...device.config } : null;

      // Update device config
      device.config = config;

      // Track who configured the device
      device.lastConfiguredBy = req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined;
      device.lastConfiguredAt = new Date();

      // Update cache info
      device.cacheInfo = device.cacheInfo || {
        configVersion: 0,
        lastSyncTime: new Date(),
        cachedMedia: [],
        totalCacheSize: 0,
      };
      device.cacheInfo.configVersion += 1;
      device.cacheInfo.lastSyncTime = new Date();
      const configVersion = device.cacheInfo.configVersion;

      // Update cached media tracking
      const cachedMediaArray: any[] = [];
      if (config.sections && Array.isArray(config.sections)) {
        config.sections.forEach((section: any, sectionIndex: number) => {
          if (section.contentType === 'multimedia' && section.mediaUrls) {
            section.mediaUrls.forEach((url: string) => {
              const mediaId = url.split('/').pop()?.split('-')[0] || '';
              cachedMediaArray.push({
                mediaId,
                url,
                size: 0,
                cachedAt: new Date(),
                section: sectionIndex + 1,
              });
            });
          }
        });
      }
      device.cacheInfo.cachedMedia = cachedMediaArray;
      device.cacheInfo.totalCacheSize = 0;
      device.set('health.cloudSync', {
        configVersion,
        status: 'pending',
        mediaTotal: mediaPaths.length,
        mediaCached: 0,
        message: 'Waiting for device to download and apply this group configuration',
        updatedAt: new Date(),
      });

      await device.save();

      // Emit config update via socket
      io.to(`device:${device.deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo.configVersion });

      // Audit logging must not turn an already saved device config into a false failure.
      if (req.userId) {
        try {
          await AuditLog.create({
            userId: req.userId,
            action: 'configure_device',
            targetType: 'device',
            targetId: device.deviceId,
            details: {
              deviceName: device.name,
              groupId: groupId,
              groupName: group.name,
              layout: config.layout,
              mediaCount: allMediaUrls.length,
              previousConfig: previousConfig ? { layout: previousConfig.layout } : null,
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          });
        } catch (auditError) {
          console.error(`Audit logging failed for device ${device.deviceId}:`, auditError);
        }
      }

      return device;
    });

    const updateResults = await Promise.allSettled(updatePromises);
    const appliedDeviceIds = updateResults.flatMap((result, index) => result.status === 'fulfilled' ? [devices[index].deviceId] : []);
    const failedDeviceIds = updateResults.flatMap((result, index) => result.status === 'rejected' ? [devices[index].deviceId] : []);

    // Reconcile media assignment records for devices that actually saved.
    if (appliedDeviceIds.length > 0) {
      try {
        const selectedUrls = new Set(allMediaUrls);
        const groupMedia = await Media.find({ assignedDevices: { $in: appliedDeviceIds } }).select('_id url');
        await Promise.all(groupMedia.filter(media => !selectedUrls.has(media.url)).map(media =>
          Media.findByIdAndUpdate(media._id, { $pull: { assignedDevices: { $in: appliedDeviceIds } } })
        ));
        const selectedMedia = await Media.find({ url: { $in: allMediaUrls } });
        await Promise.all(selectedMedia.map(media =>
          Media.findByIdAndUpdate(media._id, { $addToSet: { assignedDevices: { $each: appliedDeviceIds } } })
        ));
      } catch (mediaError) {
        console.error('Error updating media assignments for group:', mediaError);
      }
    }

    if (failedDeviceIds.length) {
      res.status(207).json({
        success: false,
        partial: appliedDeviceIds.length > 0,
        appliedDeviceIds,
        failedDeviceIds,
        message: `Config applied to ${appliedDeviceIds.length} devices; failed on ${failedDeviceIds.length}`,
      });
      return;
    }

    // Audit log for group configuration
    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'configure_device',
        targetType: 'group',
        targetId: groupId,
        details: {
          groupName: group.name,
          deviceCount: devices.length,
          mediaCount: allMediaUrls.length,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json({
      success: true,
      message: `Config applied to ${devices.length} devices in group ${group.name}`,
      deviceCount: devices.length,
    });
  } catch (error) {
    console.error('Configure group error:', error);
    res.status(500).json({ error: 'Failed to configure group' });
  }
};
