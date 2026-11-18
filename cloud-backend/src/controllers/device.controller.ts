import { Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Device from '../models/Device';
import Media from '../models/Media';
import Group from '../models/Group';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { getSocketInstance, pushDeviceHeartbeat, revokeDeviceSockets } from '../socket/socket';
import { AuthRequest } from '../middleware/auth.middleware';
import env from '../config/env';
import { getMediaPathFromUrl } from '../utils/mediaUrl';
import { cacheGet, cacheSet, cacheDelPattern } from '../config/redis';

export const getDeviceStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Only admin can access device stats
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get actual counts from database
    const totalDevices = await Device.countDocuments();
    const onlineDevices = await Device.countDocuments({ status: 'online' });
    const offlineDevices = await Device.countDocuments({ status: 'offline' });

    res.json({
      totalDevices,
      onlineDevices,
      offlineDevices,
    });
  } catch (error) {
    console.error('Get device stats error:', error);
    res.status(500).json({ error: 'Failed to fetch device stats' });
  }
};

export const getDevices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, group, includeUnassigned, assignedUserId, search, page = '1', limit = '10' } = req.query;
    const filter: any = {};

    // Handle 30D+ filter - convert to date-based query
    if (status === '30D+') {
      // Devices offline for 30+ days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filter.status = 'offline';
      filter.lastSeen = { $lt: thirtyDaysAgo };
    } else if (status) {
      filter.status = status;
    }

    if (group) filter.group = group;

    // Filter by assigned user if specified (for admin)
    if (assignedUserId) {
      filter.assignedUserId = assignedUserId;
    }

    // Search filter - search in name, deviceId, location
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      filter.$or = [
        { name: searchRegex },
        { deviceId: searchRegex },
        { location: searchRegex }
      ];
    }

    // Non-admin users can only see their assigned devices
    if (req.userRole !== 'admin' && req.userId) {
      filter.assignedUserId = req.userId;
    }

    // Admin can optionally include unassigned devices
    if (req.userRole === 'admin' && includeUnassigned === 'true') {
      // Don't filter by assignedUserId, show all devices
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on filter and pagination
    const cacheKey = `devices:${JSON.stringify(filter)}:${req.userRole}:${req.userId || 'admin'}:page:${pageNum}:limit:${limitNum}`;

    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] Devices from cache: ${cacheKey}`);
      res.json(JSON.parse(cached));
      return;
    }

    // Get total count
    const total = await Device.countDocuments(filter);

    let summary: any;
    if (req.userRole !== 'admin') {
      const assigned = await Device.find({ assignedUserId: req.userId }).select('deviceId status').lean();
      const assignedIds = assigned.map((device: any) => String(device.deviceId));
      const groups = assignedIds.length
        ? await Group.find({ $or: [
            { ownerId: req.userId },
            { ownerId: { $exists: false }, devices: { $in: assignedIds } },
          ] }).select('devices').lean()
        : await Group.find({ ownerId: req.userId }).select('devices').lean();
      const groupedIds = new Set(groups.flatMap((group: any) => group.devices || []));
      summary = {
        totalDevices: assigned.length,
        onlineDevices: assigned.filter((device: any) => device.status === 'online').length,
        offlineDevices: assigned.filter((device: any) => device.status !== 'online').length,
        groupedDevices: assigned.filter((device: any) => groupedIds.has(device.deviceId)).length,
      };
    }

    // Get paginated devices
    const devices = await Device.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Ensure all devices have activated field (migration for existing devices)
    const devicesWithActivation = devices.map(device => ({
      ...device.toObject(),
      activated: device.activated !== undefined ? device.activated : false
    }));

    const totalPages = Math.ceil(total / limitNum);

    console.log(`Get devices: userRole=${req.userRole}, userId=${req.userId}, filter=${JSON.stringify(filter)}, count=${devices.length}, total=${total}, page=${pageNum}, totalPages=${totalPages}`);

    // Cache the result (TTL: 60 seconds)
    await cacheSet(cacheKey, JSON.stringify({
      data: devicesWithActivation,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      summary,
    }), 60);

    res.json({
      data: devicesWithActivation,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      summary,
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
};

export const getDevice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const device = await Device.findOne({ deviceId: req.params.id });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    console.log('Get device access check:', {
      deviceId: req.params.id,
      userRole: req.userRole,
      userId: req.userId,
      deviceAssignedUserId: device.assignedUserId?.toString(),
      isAssigned: device.assignedUserId?.toString() === req.userId
    });

    // Non-admin users can only access their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== req.userId)) {
      console.log('Access denied: Device not assigned to user');
      res.status(403).json({ error: 'Access denied: Device not assigned to your account' });
      return;
    }

    res.json(device);
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
};

export const heartbeat = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const { status, storage, appVersion, location, configVersion: clientConfigVersion } = req.body;

    const now = new Date();
    const update: Record<string, unknown> = {
      status: status || 'online',
      lastSeen: now,
    };
    if (storage) update.storage = storage;
    if (appVersion) update.appVersion = appVersion;
    if (location) update.location = location;
    // Device labels are admin managed; heartbeat payloads must not overwrite them.
    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: update },
      { new: true, runValidators: true }
    ).select('deviceId name assignedUserId status lastSeen appVersion storage cacheInfo.configVersion config');

    if (!device) {
      // Device not found - reject connection for security
      console.log(`Heartbeat rejected: Device ${deviceId} not found in database`);
      res.status(404).json({ 
        error: 'Device not registered',
        message: 'This device is not registered in the system. Please contact your administrator.'
      });
      return;
    }

    pushDeviceHeartbeat(device);

    // Send the full configuration only when the player's persisted version is stale.
    const configVersion = Number(device.cacheInfo?.configVersion || 0);
    const hasNewConfig = Number(clientConfigVersion) !== configVersion;
    res.json({
      success: true,
      configVersion,
      ...(hasNewConfig && device.config ? { config: device.config } : {}),
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
};

export const reportDeviceHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    if (!req.deviceId || req.deviceId !== deviceId) {
      res.status(403).json({ error: 'Device token does not match requested device' });
      return;
    }
    const kind = String(req.body?.kind || 'snapshot');
    if (!['snapshot', 'playback-error'].includes(kind)) {
      res.status(400).json({ error: 'Unsupported health report type' });
      return;
    }

    const timestamp = new Date();
    const section = Math.max(0, Math.min(3, Math.trunc(Number(req.body?.section || 0))));
    const report = {
      kind,
      at: timestamp,
      section,
      fileName: String(req.body?.fileName || '').slice(0, 200),
      mediaType: String(req.body?.mediaType || '').slice(0, 64),
      message: String(req.body?.message || '').slice(0, 500),
    };
    const update: Record<string, any> = {
      $set: { 'health.lastReportAt': timestamp },
    };
    if (kind === 'playback-error') {
      update.$set['health.lastError'] = report;
      update.$inc = { 'health.playbackErrorCount': 1 };
      update.$push = { 'health.recentErrors': { $each: [report], $slice: -20 } };
    } else {
      update.$set['health.lastSnapshot'] = report;
    }
    const device = await Device.findOneAndUpdate(
      { deviceId, activated: true },
      update,
      { new: true, projection: { health: 1 } }
    );
    if (!device) {
      res.status(404).json({ error: 'Device not found or inactive' });
      return;
    }
    res.json({ success: true, health: device.health });
  } catch (error) {
    console.error('Device health report error:', error);
    res.status(500).json({ error: 'Failed to store device health report' });
  }
};

export const reportCloudSyncStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    if (!req.deviceId || req.deviceId !== deviceId) {
      res.status(403).json({ error: 'Device token does not match requested device' });
      return;
    }
    const configVersion = Math.max(0, Math.trunc(Number(req.body?.configVersion)));
    const status = String(req.body?.status || '');
    if (!Number.isFinite(configVersion) || !['pending', 'ready', 'failed'].includes(status)) {
      res.status(400).json({ error: 'Invalid cloud sync status' });
      return;
    }
    const mediaTotal = Math.max(0, Math.trunc(Number(req.body?.mediaTotal || 0)));
    const mediaCached = Math.max(0, Math.min(mediaTotal, Math.trunc(Number(req.body?.mediaCached || 0))));
    const currentSnapshot = await Device.findOne({
      deviceId,
      activated: true,
      'cacheInfo.configVersion': configVersion,
    }).select('health.cloudSync config.sections').lean();
    if (!currentSnapshot) {
      const current = await Device.findOne({ deviceId }).select('cacheInfo.configVersion activated');
      res.status(current?.activated ? 409 : 404).json({
        error: current?.activated ? 'A newer config version is active' : 'Device not found or inactive',
        configVersion: current?.cacheInfo?.configVersion || 0,
      });
      return;
    }
    const savedSync = (currentSnapshot as any).health?.cloudSync || {};
    const currentConfigSections = Array.isArray((currentSnapshot as any).config?.sections)
      ? (currentSnapshot as any).config.sections
      : [];
    const configuredMediaCount = currentConfigSections.reduce((total: number, section: any) =>
      total + (section?.contentType === 'multimedia' && Array.isArray(section?.mediaUrls) ? section.mediaUrls.length : 0), 0);
    const syncSnapshotIsCurrent = Number(savedSync.configVersion) === configVersion;
    const expectedMediaTotal = Math.max(0, Math.trunc(Number(
      syncSnapshotIsCurrent ? savedSync.mediaTotal ?? configuredMediaCount : configuredMediaCount
    )));
    const onlineOnlySections = syncSnapshotIsCurrent
      ? Math.max(0, Math.trunc(Number(savedSync.onlineOnlySections || 0)))
      : currentConfigSections.filter((section: any) =>
          (section?.contentType === 'web' && String(section?.webUrl || '').trim()) ||
          (section?.contentType === 'youtube' && String(section?.youtubeUrl || '').trim())
        ).length;
    if (mediaTotal !== expectedMediaTotal || (status === 'ready' && mediaCached !== mediaTotal)) {
      res.status(400).json({ error: 'Sync status does not match the saved configuration media count' });
      return;
    }
    const cloudSync = {
      configVersion,
      status,
      mediaTotal,
      mediaCached,
      onlineOnlySections,
      message: String(req.body?.message || '').slice(0, 500),
      updatedAt: new Date(),
    };
    const syncFilter: Record<string, unknown> = { deviceId, activated: true, 'cacheInfo.configVersion': configVersion };
    // A delayed progress packet must not downgrade a completed sync.
    if (status !== 'ready') syncFilter['health.cloudSync.status'] = { $ne: 'ready' };
    const device = await Device.findOneAndUpdate(
      syncFilter,
      { $set: { 'health.cloudSync': cloudSync } },
      { new: true, projection: { health: 1, cacheInfo: 1 } }
    );
    if (!device) {
      const current = await Device.findOne({ deviceId }).select('cacheInfo.configVersion activated health.cloudSync');
      if (current?.activated && Number(current.cacheInfo?.configVersion || 0) === configVersion && (current as any).health?.cloudSync?.status === 'ready') {
        res.json({ success: true, cloudSync: (current as any).health.cloudSync });
        return;
      }
      res.status(current?.activated ? 409 : 404).json({
        error: current?.activated ? 'A newer config version is active' : 'Device not found or inactive',
        configVersion: current?.cacheInfo?.configVersion || 0,
      });
      return;
    }
    res.json({ success: true, cloudSync: device.health?.cloudSync });
  } catch (error) {
    console.error('Cloud sync status report error:', error);
    res.status(500).json({ error: 'Failed to store cloud sync status' });
  }
};

export const updateConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;  // Route uses :id, not :deviceId
    const { config } = req.body;

    console.log(`=== CONFIG UPDATE: Starting for device ${deviceId} ===`);
    console.log(`=== CONFIG UPDATE: Request config ===`, JSON.stringify(config, null, 2));

    const device = await Device.findOne({ deviceId });
    if (!device) {
      console.log(`=== CONFIG UPDATE: Device ${deviceId} NOT FOUND ===`);
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    console.log(`=== CONFIG UPDATE: Device found: ${device.name} ===`);

    // Non-admin users can only update their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== req.userId)) {
      console.log(`=== CONFIG UPDATE: Access denied for user ${req.userId} ===`);
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (req.userRole !== 'admin' && await Group.exists({ devices: deviceId })) {
      res.status(403).json({ error: 'This device is managed by a group; apply configuration from the group page' });
      return;
    }

    // Store previous config for audit
    const previousConfig = device.config ? JSON.parse(JSON.stringify(device.config)) : null;

    // Keep media type/name/size beside URL-only section assignments. The player
    // cannot infer (for example) that an opaque file ID is an MP4 from its URL.
    const configuredMediaUrls = (Array.isArray(config.sections) ? config.sections : [])
      .flatMap((section: any) => section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : [])
      .map((value: string) => getMediaPathFromUrl(value))
      .filter((path: string | null): path is string => !!path);
    const uniqueMediaPaths = [...new Set(configuredMediaUrls)];
    const configuredMedia = uniqueMediaPaths.length
      ? await Media.find({ path: { $in: uniqueMediaPaths } }).select('path originalName filename mimeType size hash updatedAt createdAt uploadedBy').lean()
      : [];
    if (configuredMedia.length !== uniqueMediaPaths.length) {
      res.status(400).json({ error: 'Configuration contains a media file that no longer exists' });
      return;
    }
    if (req.userRole !== 'admin' && configuredMedia.some((media: any) => media.uploadedBy?.toString() !== req.userId)) {
      res.status(403).json({ error: 'Configuration can only use media uploaded to your account' });
      return;
    }
    const mediaByPath = new Map(configuredMedia.map((media: any) => [String(media.path), media]));

    device.config = config;

    // Process sections to convert media URLs to absolute and clean up irrelevant fields
    let allMediaUrls: string[] = [];
    if (config.sections && Array.isArray(config.sections)) {
      device.config.sections = config.sections.map((section: any) => {
        const cleaned = { ...section };

        // Clean up irrelevant fields based on contentType
        if (cleaned.contentType === 'multimedia') {
          cleaned.webUrl = '';
          cleaned.youtubeUrl = '';
          if (cleaned.mediaUrls && Array.isArray(cleaned.mediaUrls)) {
            const absoluteUrls = cleaned.mediaUrls.map((url: string) => {
              if (url.startsWith('/api/media/file/')) {
                return `${env.SERVER_URL}${url}`;
              }
              return url;
            });
            cleaned.mediaUrls = absoluteUrls;
            cleaned.mediaItems = absoluteUrls.map((url: string) => {
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
            allMediaUrls.push(...absoluteUrls);
          }
        } else if (cleaned.contentType === 'web') {
          cleaned.mediaUrls = [];
          cleaned.youtubeUrl = '';
        } else if (cleaned.contentType === 'youtube') {
          cleaned.mediaUrls = [];
          cleaned.webUrl = '';
        }

        return cleaned;
      });

      // For fullscreen layout, create mediaUrls array for backward compatibility
      if (config.layout === 'fullscreen' && config.sections && config.sections.length > 0) {
        const firstSection = config.sections[0];
        if (firstSection.contentType === 'multimedia' && firstSection.mediaUrls) {
          device.config.mediaUrls = firstSection.mediaUrls;
        } else {
          device.config.mediaUrls = [];
        }
      } else {
        // For split/grid layouts, mediaUrls must be empty - TV app reads from sections array only
        device.config.mediaUrls = [];
      }
    } else {
      // If no sections, clear mediaUrls completely
      device.config.mediaUrls = [];
    }

    // Ensure grid2Layout is saved
    if (config.grid2Layout) {
      device.config.grid2Layout = config.grid2Layout;
    }

    // Track who configured the device
    device.lastConfiguredBy = req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined;
    device.lastConfiguredAt = new Date();

    // Update cache info - increment version and update sync time
    device.cacheInfo = device.cacheInfo || {
      configVersion: 0,
      lastSyncTime: new Date(),
      cachedMedia: [],
      totalCacheSize: 0,
    };
    device.cacheInfo.configVersion += 1;
    device.cacheInfo.lastSyncTime = new Date();
    // Count playlist placements across sections. A shared asset is downloaded
    // once but is still selected in each section and should count in each.
    const expectedMediaCount = configuredMediaUrls.length;
    device.set('health.cloudSync', {
      configVersion: device.cacheInfo.configVersion,
      status: 'pending',
      mediaTotal: expectedMediaCount,
      mediaCached: 0,
      onlineOnlySections: (Array.isArray(config.sections) ? config.sections : []).filter((section: any) =>
        (section?.contentType === 'web' && String(section?.webUrl || '').trim()) ||
        (section?.contentType === 'youtube' && String(section?.youtubeUrl || '').trim())
      ).length,
      message: 'Waiting for device to download and apply this configuration',
      updatedAt: new Date(),
    });

    // Update cached media tracking
    const cachedMediaArray: any[] = [];
    let totalCacheSize = 0;
    if (config.sections && Array.isArray(config.sections)) {
      config.sections.forEach((section: any, sectionIndex: number) => {
        if (section.contentType === 'multimedia' && section.mediaUrls) {
          section.mediaUrls.forEach((url: string) => {
            // Try to find media by URL
            const mediaId = url.split('/').pop()?.split('-')[0] || '';
            cachedMediaArray.push({
              mediaId,
              url,
              size: 0, // Will be updated by device heartbeat
              cachedAt: new Date(),
              section: sectionIndex + 1,
            });
          });
        }
      });
    }
    device.cacheInfo.cachedMedia = cachedMediaArray;
    device.cacheInfo.totalCacheSize = totalCacheSize;

    console.log(`=== CONFIG UPDATE: Saving config to database ===`);
    console.log(`Update config for device ${deviceId}:`, {
      layout: device.config.layout,
      grid2Layout: device.config.grid2Layout,
      grid3Layout: device.config.grid3Layout,
      sections: device.config.sections,
      mediaUrls: device.config.mediaUrls,
      ticker: device.config.ticker,
      cacheVersion: device.cacheInfo.configVersion,
    });

    await device.save();
    console.log(`=== CONFIG UPDATE: Config saved to database ===`);

    // Push the already-persisted config immediately. Media bookkeeping and
    // audit logging are secondary and should not make the TV wait to apply it.
    const io = getSocketInstance();
    const room = io.sockets.adapter.rooms.get(`device:${deviceId}`);
    const roomSize = room ? room.size : 0;
    console.log(`=== CONFIG UPDATE: Room ${deviceId} has ${roomSize} clients ===`);
    io.to(`device:${deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo.configVersion });
    console.log(`=== CONFIG UPDATE: Config pushed via socket to device ${deviceId} ===`);

    res.json({ success: true, config: device.config, cacheVersion: device.cacheInfo.configVersion });

    // Keep the library's device assignments and audit log in sync without
    // holding the Save response or delaying the live config event.
    void (async () => {
      try {
        const mediaDocs = allMediaUrls.length
          ? await Media.find({ url: { $in: allMediaUrls } })
          : [];
        await Promise.all(
          mediaDocs.map(media =>
            Media.findByIdAndUpdate(media._id, {
              $addToSet: { assignedDevices: deviceId }
            })
          )
        );

        const selectedUrls = new Set(allMediaUrls);
        const allDeviceMedia = await Media.find({ assignedDevices: deviceId });
        await Promise.all(
          allDeviceMedia
            .filter(media => !selectedUrls.has(media.url))
            .map(media =>
              Media.findByIdAndUpdate(media._id, {
                $pull: { assignedDevices: deviceId }
              })
            )
        );

        if (req.userId) {
          await AuditLog.create({
            userId: req.userId,
            action: 'configure_device',
            targetType: 'device',
            targetId: deviceId,
            details: {
              deviceName: device.name,
              layout: config.layout,
              mediaCount: allMediaUrls.length,
              previousConfig: previousConfig ? { layout: previousConfig.layout } : null,
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          });
        }
      } catch (sideEffectError) {
        console.error('=== CONFIG UPDATE: Post-save bookkeeping failed ===', sideEffectError);
      }
    })();
    return;
  } catch (error) {
    console.error('=== CONFIG UPDATE: Error ===', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
};

export const sendCommand = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;  // Route uses :id, not :deviceId
    const { command } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Non-admin users can only send commands to their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const io = getSocketInstance();
    io.to(`device:${deviceId}`).emit(`command:${command}`, { timestamp: new Date() });

    res.json({ success: true });
  } catch (error) {
    console.error('Send command error:', error);
    res.status(500).json({ error: 'Failed to send command' });
  }
};

export const deleteDevice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Non-admin users can only delete their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Remove device from all groups
    await Group.updateMany(
      { devices: deviceId },
      { $pull: { devices: deviceId } }
    );
    await Media.updateMany({ assignedDevices: deviceId }, { $pull: { assignedDevices: deviceId } });

    // Remove device from user's assigned devices
    if (device.assignedUserId) {
      await User.findByIdAndUpdate(device.assignedUserId, {
        $pull: { assignedDevices: deviceId }
      });
    }

    await Device.findOneAndDelete({ deviceId });
    revokeDeviceSockets(deviceId);

    // Invalidate device cache on delete
    await cacheDelPattern('devices:*');
    await cacheDelPattern('groups:*');
    await cacheDelPattern('users:*');

    res.json({ success: true });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
};

export const createDevice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId, name, group, location, activated, assignedUserId } = req.body;

    // Only admins can create devices
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Access denied: Only admins can create devices' });
      return;
    }

    // Check if device already exists
    const existingDevice = await Device.findOne({ deviceId });
    if (existingDevice) {
      res.status(409).json({ error: 'A device with this ID already exists in the system. Please use a unique device ID.' });
      return;
    }

    // Validate assignedUserId if provided
    if (assignedUserId) {
      const user = await User.findById(assignedUserId);
      if (!user) {
        res.status(400).json({ error: 'Invalid user ID provided' });
        return;
      }
    }

    // Create new device
    const device = new Device({
      deviceId,
      name: name || deviceId,
      group: group || '',
      location: location || '',
      activated: activated || false,
      assignedUserId: assignedUserId || undefined,
      status: 'offline',
      lastSeen: new Date(),
      appVersion: '1.0.0',
      storage: { used: 0, total: 0 },
      config: {
        orientation: 'horizontal',
        layout: 'fullscreen',
        sections: [],
        ticker: {},
      },
      cacheInfo: {
        configVersion: 0,
        lastSyncTime: new Date(),
        cachedMedia: [],
        totalCacheSize: 0,
      },
    });

    await device.save();

    // Update user's assignedDevices array if device is assigned
    if (assignedUserId) {
      await User.findByIdAndUpdate(
        assignedUserId,
        { $addToSet: { assignedDevices: deviceId } }
      );
    }
    await cacheDelPattern('devices:*');
    await cacheDelPattern('users:*');

    // Audit log
    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'assign_device',
        targetType: 'device',
        targetId: deviceId,
        details: {
          deviceName: device.name,
          assignedUserId: assignedUserId || null,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    console.log(`Device created: ${deviceId} by admin ${req.userId}, assigned to user: ${assignedUserId || 'none'}`);
    res.status(201).json({ success: true, device });
  } catch (error) {
    console.error('Create device error:', error);
    res.status(500).json({ error: 'Failed to create device' });
  }
};

export const updateDevice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const updates = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Non-admin users can only update their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Validate assignedUserId if being updated (skip if empty string for unassigned)
    if (updates.assignedUserId !== undefined && updates.assignedUserId !== null && updates.assignedUserId !== '') {
      const user = await User.findById(updates.assignedUserId);
      if (!user) {
        res.status(400).json({ error: 'Invalid user ID provided' });
        return;
      }
    }

    // Track assignment changes for audit
    const oldAssignedUserId = device.assignedUserId?.toString();
    let assignmentChanged = false;

    // Update allowed fields
    if (updates.name) device.name = updates.name;
    if (updates.status) device.status = updates.status;
    if (updates.assignedUserId !== undefined) {
      // Convert empty string to undefined for unassigned
      const newAssignedUserId = updates.assignedUserId || undefined;

      device.assignedUserId = newAssignedUserId;

      // Update user's assignedDevices arrays
      // Remove from old user's assignedDevices if changed
      if (oldAssignedUserId && oldAssignedUserId !== newAssignedUserId) {
        await User.findByIdAndUpdate(
          oldAssignedUserId,
          { $pull: { assignedDevices: deviceId } }
        );
        assignmentChanged = true;
      }

      // Add to new user's assignedDevices if assigned
      if (newAssignedUserId && newAssignedUserId !== oldAssignedUserId) {
        await User.findByIdAndUpdate(
          newAssignedUserId,
          { $addToSet: { assignedDevices: deviceId } }
        );
        assignmentChanged = true;
      }
    }
    if (updates.location) device.location = updates.location;
    if (updates.storage) device.storage = updates.storage;
    if (updates.appVersion) device.appVersion = updates.appVersion;
    if (updates.activated !== undefined) device.activated = updates.activated;

    if (assignmentChanged) {
      await Group.updateMany({ devices: deviceId }, { $pull: { devices: deviceId } });
      await Media.updateMany({ assignedDevices: deviceId }, { $pull: { assignedDevices: deviceId } });
      device.config = { ...device.config, layout: 'fullscreen', sections: [], mediaUrls: [], ticker: { text: '' } } as any;
      if (device.cacheInfo) {
        device.cacheInfo.configVersion += 1;
        device.cacheInfo.lastSyncTime = new Date();
        device.cacheInfo.cachedMedia = [];
      }
      device.set('health.cloudSync', {
        configVersion: device.cacheInfo?.configVersion || 0,
        status: 'pending',
        mediaTotal: 0,
        mediaCached: 0,
        onlineOnlySections: 0,
        message: 'Waiting for the device to apply its new assignment',
        updatedAt: new Date(),
      });
    }

    await device.save();

    if (updates.activated === false) revokeDeviceSockets(deviceId);
    if (assignmentChanged) getSocketInstance().to(`device:${deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });

    // Invalidate device cache on update
    await cacheDelPattern('devices:*');
    if (assignmentChanged) await cacheDelPattern('users:*');

    // Audit log for device assignment changes
    if (assignmentChanged && req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: updates.assignedUserId ? 'assign_device' : 'unassign_device',
        targetType: 'device',
        targetId: deviceId,
        details: {
          deviceName: device.name,
          oldAssignedUserId,
          newAssignedUserId: updates.assignedUserId || null,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    console.log(`Device updated: ${deviceId} by admin ${req.userId}, assigned to user: ${updates.assignedUserId || 'none'}`);
    res.json({ success: true, device });
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
};

export const checkDeviceActivation = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.json({ activated: false, exists: false });
      return;
    }

    const shouldIssueToken = String(req.query.issueToken || '') === 'true';
    const deviceToken = device.activated && shouldIssueToken
      ? jwt.sign({ role: 'device', deviceId }, env.JWT_SECRET, { expiresIn: '1h' })
      : undefined;
    res.json({ activated: device.activated, exists: true, deviceToken, deviceTokenExpiresIn: deviceToken ? 3600 : undefined });
  } catch (error) {
    console.error('Check device activation error:', error);
    res.status(500).json({ error: 'Failed to check device activation' });
  }
};

export const getDeviceConfigForDevice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.deviceId || req.deviceId !== req.params.id) {
      res.status(403).json({ error: 'Device token does not match requested device' });
      return;
    }
    const device = await Device.findOne({ deviceId: req.deviceId, activated: true }).select('config cacheInfo.configVersion');
    if (!device) {
      res.status(404).json({ error: 'Device not found or inactive' });
      return;
    }
    res.json({ config: device.config, configVersion: device.cacheInfo?.configVersion || 0 });
  } catch (error) {
    console.error('Get device config error:', error);
    res.status(500).json({ error: 'Failed to fetch device configuration' });
  }
};

export const getDeviceMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Non-admin users can only access their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get media assigned to this device
    const mediaList = await Media.find({ assignedDevices: deviceId }).sort({ createdAt: -1 });

    res.json(mediaList);
  } catch (error) {
    console.error('Get device media error:', error);
    res.status(500).json({ error: 'Failed to fetch device media' });
  }
};
