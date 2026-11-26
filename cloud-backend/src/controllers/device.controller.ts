import { Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Device from '../models/Device';
import Media from '../models/Media';
import Group from '../models/Group';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { getSocketInstance, pushDeviceHeartbeat, pushEmergencyClearToDevice, pushEmergencyToDevice, pushEmergencyToUser, revokeDeviceSockets } from '../socket/socket';
import { AuthRequest } from '../middleware/auth.middleware';
import env from '../config/env';
import { getMediaPathFromUrl } from '../utils/mediaUrl';
import { processConfigForStorage } from '../utils/configProcessor';
import { applyScheduleToConfig } from '../services/schedule.service';
import ScheduleTemplate from '../models/Schedule';
import { cacheGet, cacheSet, cacheDelPattern } from '../config/redis';
import { countConfiguredMedia, getConfiguredMediaBytes, getConfiguredMediaUrls } from '../utils/configMedia';
import { invalidateDevicePaths, invalidateDeviceActive } from '../utils/fileAccessCache';
import { checkDeviceLimit, checkAssignQuota, recordAssign } from '../utils/quota';

const hasDeviceScope = (req: AuthRequest, deviceId: string): boolean =>
  !req.isSubUser || (req.resourceAccess?.devices || []).includes(String(deviceId));

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
    const { status, group, includeUnassigned, assignedUserId, excludeAssignedUserId, search, page = '1', limit = '10', sortBy, sortOrder } = req.query;
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

    // Admin-only: exclude devices assigned to a specific user (e.g. the
    // "available devices" list on the user device-assignment page).
    if (req.userRole === 'admin' && excludeAssignedUserId) {
      filter.assignedUserId = { $ne: excludeAssignedUserId };
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

    // Non-admin users can only see their assigned devices (sub-users see parent's devices)
    if (req.userRole !== 'admin' && req.userId) {
      filter.assignedUserId = req.effectiveUserId || req.userId;
      if (req.isSubUser) filter.deviceId = { $in: req.resourceAccess?.devices || [] };
    }

    // Admin can optionally include unassigned devices
    if (req.userRole === 'admin' && includeUnassigned === 'true') {
      // Don't filter by assignedUserId, show all devices
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key from raw query params — JSON.stringify(filter) cannot
    // serialize RegExp (becomes {}), which made every search share one entry.
    const cacheKey = `devices:${req.userRole}:${req.userId || 'admin'}:${status || ''}:${group || ''}:${assignedUserId || ''}:${excludeAssignedUserId || ''}:${includeUnassigned || ''}:${search || ''}:sort:${sortBy || ''}:${sortOrder || ''}:page:${pageNum}:limit:${limitNum}`;

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
      const ownerId = req.effectiveUserId || req.userId;
      // Summary costs 2 extra queries per page request — cache it briefly.
      const summaryKey = `devices:summary:${ownerId}`;
      const cachedSummary = await cacheGet(summaryKey);
      if (cachedSummary) {
        summary = JSON.parse(cachedSummary);
      } else {
        const assigned = await Device.find({ assignedUserId: ownerId }).select('deviceId status').lean();
        const assignedIds = assigned.map((device: any) => String(device.deviceId));
        const groups = assignedIds.length
          ? await Group.find({ $or: [
              { ownerId },
              { ownerId: { $exists: false }, devices: { $in: assignedIds } },
            ] }).select('devices').lean()
          : await Group.find({ ownerId }).select('devices').lean();
        const groupedIds = new Set(groups.flatMap((group: any) => group.devices || []));
        summary = {
          totalDevices: assigned.length,
          onlineDevices: assigned.filter((device: any) => device.status === 'online').length,
          offlineDevices: assigned.filter((device: any) => device.status !== 'online').length,
          groupedDevices: assigned.filter((device: any) => groupedIds.has(device.deviceId)).length,
        };
        await cacheSet(summaryKey, JSON.stringify(summary), 30);
      }
    }

    // Whitelist sortable fields to prevent arbitrary field injection
    const SORTABLE_FIELDS: Record<string, 1 | -1> = {
      name: 1, deviceId: 1, status: 1, location: 1, lastSeen: 1, createdAt: 1, updatedAt: 1,
    };
    const sortField = (sortBy && SORTABLE_FIELDS[sortBy as string]) ? (sortBy as string) : 'updatedAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    // Get paginated devices
    const devices = await Device.find(filter)
      .select('-configHistory')
      .sort({ [sortField]: sortDir })
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
    const device = await Device.findOne({ deviceId: req.params.id }).select('-configHistory');
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
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
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

export const getDeviceConfigHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const device = await Device.findOne({ deviceId: req.params.id }).select('assignedUserId configHistory');
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    if (req.userRole !== 'admin' && (device.assignedUserId?.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    // History is written newest-first, but sort explicitly so legacy records
    // and any future write path always return newest-first to every client.
    const entries = [...(device.configHistory || [])].sort(
      (a: any, b: any) => Number(new Date(b?.savedAt || 0)) - Number(new Date(a?.savedAt || 0))
    ).slice(0, 2);
    res.json({ entries });
  } catch (error) {
    console.error('Get device config history error:', error);
    res.status(500).json({ error: 'Failed to fetch configuration history' });
  }
};

export const retryCloudSync = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const device = await Device.findOne({ deviceId: req.params.id });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    if (req.userRole !== 'admin' && (device.assignedUserId?.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if ((device.health as any)?.cloudSync?.status !== 'failed') {
      res.status(409).json({ error: 'Only a failed device sync can be retried' });
      return;
    }
    device.cacheInfo = device.cacheInfo || {
      configVersion: 0,
      lastSyncTime: new Date(),
      cachedMedia: [],
      totalCacheSize: 0,
    } as any;
    const configVersion = Number(device.cacheInfo.configVersion || 0) + 1;
    device.cacheInfo.configVersion = configVersion;
    device.cacheInfo.lastSyncTime = new Date();
    const previousSync = (device.health as any)?.cloudSync || {};
    const mediaTotal = countConfiguredMedia(device.config);
    device.set('health.cloudSync', {
      configVersion,
      status: 'pending',
      mediaTotal,
      mediaCached: 0,
      requiredStorageBytes: Math.max(0, Number(previousSync.requiredStorageBytes || 0)),
      message: 'Manual retry requested; the TV will download and verify this configuration again',
      updatedAt: new Date(),
    });
    await device.save();
    getSocketInstance().to(`device:${device.deviceId}`).emit('config:update', {
      config: device.config,
      configVersion,
      retry: true,
    });
    await cacheDelPattern('devices:*');
    res.json({ success: true, configVersion, status: 'pending' });
  } catch (error) {
    console.error('Retry Cloud sync error:', error);
    res.status(500).json({ error: 'Failed to retry device sync' });
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
    ).select('deviceId name assignedUserId status lastSeen appVersion storage cacheInfo.configVersion config emergencyAlert');

    if (!device) {
      // Device not found - reject connection for security
      console.log(`Heartbeat rejected: Device ${deviceId} not found in database`);
      res.status(404).json({ 
        error: 'Device not registered',
        message: 'This device is not registered in the system. Please contact your administrator.'
      });
      return;
    }

    // NOTE: do NOT purge devices:* here. Every heartbeat (~667/sec at 40k
    // devices) ran a full Redis SCAN and made the 60s list cache useless.
    // Status/lastSeen staleness is already bounded by the cache TTL, and real
    // mutations (config, assignment, delete, group ops) invalidate explicitly.
    pushDeviceHeartbeat(device);

    // Send the full configuration only when the player's persisted version is stale.
    const configVersion = Number(device.cacheInfo?.configVersion || 0);
    const hasNewConfig = Number(clientConfigVersion) !== configVersion;
    res.json({
      success: true,
      configVersion,
      emergencyAlert: device.emergencyAlert || null,
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
    }).select('health.cloudSync config.sections config.schedule').lean();
    if (!currentSnapshot) {
      const current = await Device.findOne({ deviceId }).select('cacheInfo.configVersion activated');
      res.status(current?.activated ? 409 : 404).json({
        error: current?.activated ? 'A newer config version is active' : 'Device not found or inactive',
        configVersion: current?.cacheInfo?.configVersion || 0,
      });
      return;
    }
    const savedSync = (currentSnapshot as any).health?.cloudSync || {};
    const currentConfig = (currentSnapshot as any).config || {};
    // The TV caches media from the base sections AND every schedule profile,
    // so the expected total must include both or sync reports get rejected.
    const configuredMediaCount = countConfiguredMedia(currentConfig);
    const syncSnapshotIsCurrent = Number(savedSync.configVersion) === configVersion;
    const savedMediaTotal = Math.max(0, Math.trunc(Number(savedSync.mediaTotal ?? 0)));
    const expectedMediaTotal = Math.max(0, Math.trunc(Number(
      syncSnapshotIsCurrent && savedMediaTotal > 0 ? savedMediaTotal : configuredMediaCount
    )));
    const currentConfigSections = Array.isArray(currentConfig.sections) ? currentConfig.sections : [];
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
      requiredStorageBytes: Math.max(0, Number(req.body?.requiredStorageBytes ?? savedSync.requiredStorageBytes ?? 0)),
      availableStorageBytes: Math.max(0, Number(req.body?.availableStorageBytes ?? savedSync.availableStorageBytes ?? 0)),
      storageReserveBytes: Math.max(0, Number(req.body?.storageReserveBytes ?? savedSync.storageReserveBytes ?? 0)),
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

    console.log(`Config update requested for device ${deviceId}`);

    const device = await Device.findOne({ deviceId });
    if (!device) {
      console.log(`Config update: device ${deviceId} not found`);
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    console.log(`Config update: device ${deviceId} (${device.name})`);

    // Non-admin users can only update their assigned devices
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
      console.log(`Config update: access denied for user ${req.userId} on device ${deviceId}`);
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (req.userRole !== 'admin' && await Group.exists({ devices: deviceId })) {
      res.status(403).json({ error: 'This device is managed by a group; apply configuration from the group page' });
      return;
    }

    // Monthly assignment-operation quota: 1 config save = 1 op (same rule as
    // group configure and media assign). Admin saves are unmetered.
    const assignOwnerId = req.effectiveUserId || req.userId;
    if (req.userRole !== 'admin' && assignOwnerId) {
      const assignQuota = await checkAssignQuota(assignOwnerId);
      if (!assignQuota.ok) {
        res.status(assignQuota.status || 429).json({ error: assignQuota.error });
        return;
      }
    }

    // Store previous config for audit (schedule payload is derived, not user content)
    const previousConfig = device.config ? JSON.parse(JSON.stringify(device.config)) : null;
    if (previousConfig) delete previousConfig.schedule;

    // Validate media and convert the submitted config into the stored shape
    // (absolute URLs, mediaItems metadata, cleaned fields, legacy mediaUrls).
    const processed = await processConfigForStorage(config, req.userRole === 'admin' ? undefined : (req.effectiveUserId || req.userId));
    if (processed.error || !processed.config) {
      res.status(processed.status || 400).json({ error: processed.error || 'Invalid configuration' });
      return;
    }

    if (previousConfig && JSON.stringify(previousConfig) !== JSON.stringify(processed.config)) {
      device.configHistory = [
        { config: previousConfig, configVersion: Number(device.cacheInfo?.configVersion || 0), savedAt: new Date(), savedBy: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined, source: 'device' },
        ...(device.configHistory || []),
      ].slice(0, 2) as any;
    }
    device.config = processed.config;
    // Re-attach the resolved schedule payload (config.schedule) so template
    // schedules survive manual config saves.
    await applyScheduleToConfig(device);
    const expectedMediaCount = countConfiguredMedia(device.config);

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
    device.set('health.cloudSync', {
      configVersion: device.cacheInfo.configVersion,
      status: 'pending',
      mediaTotal: expectedMediaCount,
      mediaCached: 0,
      requiredStorageBytes: getConfiguredMediaBytes(device.config),
      onlineOnlySections: (Array.isArray(device.config.sections) ? device.config.sections : []).filter((section: any) =>
        (section?.contentType === 'web' && String(section?.webUrl || '').trim()) ||
        (section?.contentType === 'youtube' && String(section?.youtubeUrl || '').trim())
      ).length,
      message: 'Waiting for device to download and apply this configuration',
      updatedAt: new Date(),
    });

    // Update cached media tracking
    const cachedMediaArray: any[] = [];
    let totalCacheSize = 0;
    if (device.config.sections && Array.isArray(device.config.sections)) {
      device.config.sections.forEach((section: any, sectionIndex: number) => {
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

    console.log(`Config update for device ${deviceId}: layout=${device.config.layout}, sections=${Array.isArray(device.config.sections) ? device.config.sections.length : 0}, configVersion=${device.cacheInfo.configVersion}`);

    await device.save();
    await invalidateDevicePaths(deviceId);
    console.log(`Config saved for device ${deviceId} (version ${device.cacheInfo.configVersion})`);

    if (req.userRole !== 'admin' && assignOwnerId) {
      await recordAssign(assignOwnerId);
    }

    // Push the already-persisted config immediately. Media bookkeeping and
    // audit logging are secondary and should not make the TV wait to apply it.
    const io = getSocketInstance();
    const room = io.sockets.adapter.rooms.get(`device:${deviceId}`);
    const roomSize = room ? room.size : 0;
    io.to(`device:${deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo.configVersion });
    console.log(`Config pushed via socket to device ${deviceId} (${roomSize} client(s) in room)`);

    res.json({ success: true, config: device.config, cacheVersion: device.cacheInfo.configVersion });

    // Keep the library's device assignments and audit log in sync without
    // holding the Save response or delaying the live config event.
    void (async () => {
      try {
        // Covers multimedia sections, legacy top-level mediaUrls, and every
        // schedule profile's media so assignedDevices stays complete.
        const selectedUrls = getConfiguredMediaUrls(device.config);
        const mediaDocs = selectedUrls.size
          ? await Media.find({ url: { $in: [...selectedUrls] } })
          : [];
        await Promise.all(
          mediaDocs.map(media =>
            Media.findByIdAndUpdate(media._id, {
              $addToSet: { assignedDevices: deviceId }
            })
          )
        );
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
              mediaCount: selectedUrls.size,
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
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
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
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
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

    // Remove schedule templates targeting this device before deleting it
    await ScheduleTemplate.deleteMany({ targetType: 'device', targetId: deviceId });
    await Device.findOneAndDelete({ deviceId });
    revokeDeviceSockets(deviceId);
    await invalidateDevicePaths(deviceId);
    await invalidateDeviceActive(deviceId);

    // Invalidate device cache on delete
    await cacheDelPattern('devices:*');
    await cacheDelPattern('groups:*');
    await cacheDelPattern('users:*');

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'delete_device',
        targetType: 'device',
        targetId: deviceId,
        details: {
          deviceName: device.name,
          assignedUserId: device.assignedUserId?.toString() || null,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

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
      if (user.role === 'sub-user' || user.parentId) {
        res.status(400).json({ error: 'Devices cannot be assigned to a sub-user. Assign them to the parent account instead.' });
        return;
      }
      // Per-account device limit (plan-based).
      const deviceLimit = await checkDeviceLimit(assignedUserId, 1);
      if (!deviceLimit.ok) {
        res.status(400).json({ error: deviceLimit.error });
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
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
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
      if (user.role === 'sub-user' || user.parentId) {
        res.status(400).json({ error: 'Devices cannot be assigned to a sub-user. Assign them to the parent account instead.' });
        return;
      }
      // Per-account device limit (plan-based) — skip when the assignment is
      // unchanged (device already counted toward this user's quota).
      const targetUserId = String(updates.assignedUserId);
      // A device already assigned to another account must be unassigned
      // first — prevents accidental reassignment that wipes its config,
      // schedules and media assignments.
      const currentAssignee = device.assignedUserId ? String(device.assignedUserId) : '';
      if (currentAssignee && currentAssignee !== targetUserId) {
        res.status(400).json({ error: 'Device is already assigned to another user. Unassign it first.' });
        return;
      }
      if (currentAssignee !== targetUserId) {
        const deviceLimit = await checkDeviceLimit(targetUserId, 1);
        if (!deviceLimit.ok) {
          res.status(400).json({ error: deviceLimit.error });
          return;
        }
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
      const priorConfig = device.config ? JSON.parse(JSON.stringify(device.config)) : null;
      if (priorConfig) {
        device.configHistory = [
          { config: priorConfig, configVersion: Number(device.cacheInfo?.configVersion || 0), savedAt: new Date(), savedBy: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined, source: 'assignment-change' },
          ...(device.configHistory || []),
        ].slice(0, 2) as any;
      }
      await Group.updateMany({ devices: deviceId }, { $pull: { devices: deviceId } });
      // Direct device schedules belong to the previous assignment. Remove
      // them before the device is exposed to its next account.
      await ScheduleTemplate.deleteMany({ targetType: 'device', targetId: deviceId });
      await Media.updateMany({ assignedDevices: deviceId }, { $pull: { assignedDevices: deviceId } });
      const resetConfig = { ...device.config, layout: 'fullscreen', sections: [], mediaUrls: [], ticker: { text: '' } } as any;
      delete resetConfig.schedule;
      device.config = resetConfig;
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
    await invalidateDevicePaths(deviceId);
    await invalidateDeviceActive(deviceId);

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
    const device = await Device.findOne({ deviceId: req.deviceId, activated: true }).select('config cacheInfo.configVersion emergencyAlert');
    if (!device) {
      res.status(404).json({ error: 'Device not found or inactive' });
      return;
    }
    res.json({ config: device.config, configVersion: device.cacheInfo?.configVersion || 0, emergencyAlert: device.emergencyAlert || null });
  } catch (error) {
    console.error('Get device config error:', error);
    res.status(500).json({ error: 'Failed to fetch device configuration' });
  }
};

export const buildEmergencyAlert = async (
  body: any,
  mediaOwnerId?: string,
  triggeredById?: string
): Promise<{ alert?: any; error?: string }> => {
  const mediaUrl = String(body?.mediaUrl || '').trim();
  const message = String(body?.message || '').trim();
  const title = String(body?.title || 'EMERGENCY ALERT').trim() || 'EMERGENCY ALERT';
  const kind: 'message' | 'media' = mediaUrl ? 'media' : 'message';

  if (kind === 'message' && !message) {
    return { error: 'Message is required when no media file is selected' };
  }

  let mediaType = '';
  if (kind === 'media') {
    const mediaPath = getMediaPathFromUrl(mediaUrl);
    if (!mediaPath) {
      return { error: 'Media URL is not a valid cloud media file' };
    }
    const media = await Media.findOne({ path: mediaPath }).select('mimeType uploadedBy').lean();
    if (!media) {
      return { error: 'Selected media file was not found' };
    }
    if (mediaOwnerId && String(media.uploadedBy || '') !== String(mediaOwnerId)) {
      return { error: 'You can only use media files uploaded by your account' };
    }
    mediaType = String((media as any).mimeType || '');
  }

  return {
    alert: {
      active: true,
      kind,
      type: String(body?.type || 'GENERAL').trim().slice(0, 32) || 'GENERAL',
      title: title.slice(0, 120),
      message: message.slice(0, 1000),
      mediaUrl: kind === 'media' ? mediaUrl.slice(0, 2000) : undefined,
      mediaType: kind === 'media' ? mediaType.slice(0, 64) : undefined,
      sound: Boolean(body?.sound),
      triggeredAt: new Date(),
      triggeredBy: triggeredById ? new mongoose.Types.ObjectId(triggeredById) : undefined,
    },
  };
};

export const triggerEmergency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { alert, error } = await buildEmergencyAlert(req.body, req.userRole === 'admin' ? undefined : (req.effectiveUserId || req.userId), req.userId);
    if (!alert) {
      res.status(400).json({ error: error || 'Invalid emergency alert payload' });
      return;
    }

    device.emergencyAlert = alert;
    await device.save();
    await invalidateDevicePaths(deviceId);

    pushEmergencyToDevice(deviceId, { ...alert, deviceId });
    pushEmergencyToUser(device.assignedUserId?.toString(), { deviceId, action: 'triggered', alert });

    res.json({ success: true, alert });
  } catch (error) {
    console.error('Trigger emergency error:', error);
    res.status(500).json({ error: 'Failed to trigger emergency alert' });
  }
};

export const clearEmergency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    device.emergencyAlert = null;
    await device.save();
    await invalidateDevicePaths(deviceId);

    pushEmergencyClearToDevice(deviceId);
    pushEmergencyToUser(device.assignedUserId?.toString(), { deviceId, action: 'cleared' });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear emergency error:', error);
    res.status(500).json({ error: 'Failed to clear emergency alert' });
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
    if (req.userRole !== 'admin' && (!device.assignedUserId || device.assignedUserId.toString() !== (req.effectiveUserId || req.userId) || !hasDeviceScope(req, device.deviceId))) {
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
