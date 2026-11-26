import { Request, Response } from 'express';
import Group from '../models/Group';
import Device from '../models/Device';
import Media from '../models/Media';
import AuditLog from '../models/AuditLog';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { applyScheduleToConfig, syncScheduleForDevices, getTemplatesForDevices } from '../services/schedule.service';
import ScheduleTemplate from '../models/Schedule';
import { getSocketInstance, pushEmergencyClearToDevice, pushEmergencyToDevice, pushEmergencyToUser } from '../socket/socket';
import { buildEmergencyAlert } from './device.controller';
import mongoose from 'mongoose';
import { cacheGet, cacheSet, cacheDelPattern } from '../config/redis';
import { processConfigForStorage } from '../utils/configProcessor';
import { countConfiguredMedia, getConfiguredMediaBytes, getConfiguredMediaUrls } from '../utils/configMedia';
import { invalidateDevicePaths } from '../utils/fileAccessCache';
import { checkAssignQuota, recordAssign } from '../utils/quota';

/** Device ids assigned to any account in the dealer's tree (null for non-dealers). */
const dealerScopeDeviceIds = async (req: AuthRequest): Promise<string[] | null> => {
  if (req.userRole !== 'dealer' || !req.scopeUserIds?.length) return null;
  const devices = await Device.find({ assignedUserId: { $in: req.scopeUserIds } }).select('deviceId').lean();
  return devices.map((d: any) => String(d.deviceId));
};

/**
 * Resolve the account that effectively owns a group for the current request.
 * Returns { ok, ownerId } — ownerId is the group's real owner account (a
 * customer for dealer requests), used for device-membership and media checks.
 */
const resolveGroupOwner = async (req: AuthRequest, group: any): Promise<{ ok: boolean; ownerId?: string }> => {
  if (req.userRole === 'admin') return { ok: true };
  if (req.isSubUser && !(req.resourceAccess?.groups || []).includes(String(group._id))) return { ok: false };
  const ownerId = req.effectiveUserId || req.userId;

  if (group.ownerId) {
    const owner = String(group.ownerId);
    if (req.userRole === 'dealer') {
      return (req.scopeUserIds || []).map(String).includes(owner) ? { ok: true, ownerId: owner } : { ok: false };
    }
    return owner === String(ownerId) ? { ok: true, ownerId: owner } : { ok: false };
  }

  // Legacy group without ownerId: every device must be assigned to one
  // single account that the requester may act for.
  const groupDevices = Array.isArray(group.devices) ? group.devices : [];
  if (!groupDevices.length) return { ok: false };
  const deviceOwners = await Device.find({ deviceId: { $in: groupDevices } }).distinct('assignedUserId');
  const validOwners = [...new Set(deviceOwners.filter(Boolean).map(String))];
  if (validOwners.length !== 1) return { ok: false };
  const candidate = validOwners[0];
  const allOwned = await Device.countDocuments({ deviceId: { $in: groupDevices }, assignedUserId: candidate }) === groupDevices.length;
  if (!allOwned) return { ok: false };
  if (req.userRole === 'dealer') {
    return (req.scopeUserIds || []).map(String).includes(candidate) ? { ok: true, ownerId: candidate } : { ok: false };
  }
  return candidate === String(ownerId) ? { ok: true, ownerId: candidate } : { ok: false };
};

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
    if (req.userRole === 'dealer' && req.scopeUserIds?.length) {
      // Dealer sees groups owned by any account in their customer tree.
      // Optional ?ownerId=<customerId> narrows to one customer.
      const scopeIds = req.scopeUserIds.map(String);
      const requestedOwner = typeof req.query.ownerId === 'string' && req.query.ownerId ? String(req.query.ownerId) : null;
      if (requestedOwner && !scopeIds.includes(requestedOwner)) {
        res.status(403).json({ error: 'Groups can only be viewed for your customer accounts' });
        return;
      }
      const ownerFilterValue = requestedOwner || { $in: scopeIds };
      const scopeDevices = requestedOwner
        ? (await Device.find({ assignedUserId: requestedOwner }).select('deviceId').lean()).map((d: any) => String(d.deviceId))
        : await dealerScopeDeviceIds(req);
      const ownershipClauses: any[] = [{ ownerId: ownerFilterValue }];
      if (scopeDevices?.length) {
        ownershipClauses.push({
          ownerId: { $exists: false },
          devices: { $ne: [], $not: { $elemMatch: { $nin: scopeDevices } } },
        });
      }
      filter.$and = [
        ...(filter.name ? [{ name: filter.name }] : []),
        { $or: ownershipClauses },
      ];
      delete filter.name;
    } else if (req.userRole !== 'admin') {
      const ownerId = req.effectiveUserId || req.userId;
      const assignedDevices = await Device.find({ assignedUserId: ownerId }).select('deviceId').lean();
      userDeviceIds = assignedDevices.map((device: any) => String(device.deviceId));
      const ownershipClauses: any[] = [{ ownerId }];
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
    if (req.isSubUser) {
      filter.$and = [...(filter.$and || []), { _id: { $in: req.resourceAccess?.groups || [] } }];
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key from raw query params — JSON.stringify(filter) cannot
    // serialize RegExp (becomes {}), which made every search share one entry.
    const cacheKey = `groups:${req.userId || 'admin'}:${search || ''}:page:${pageNum}:limit:${limitNum}`;

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
      .select('-configHistory')
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

    if (req.isSubUser) {
      res.status(403).json({ error: 'Only the account owner can create groups' });
      return;
    }

    console.log('Create group request:', { name, devices, userId: req.userId, userRole: req.userRole });

    // Validation
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Group name is required' });
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

    let ownerId = req.effectiveUserId || req.userId;
    // Dealers create groups on behalf of one of their customer accounts.
    if (req.userRole === 'dealer') {
      const targetOwner = String(req.body.ownerId || '');
      const customer = targetOwner
        ? await User.findById(targetOwner).select('role parentId').lean()
        : null;
      if (!customer || (customer as any).role !== 'user' || String((customer as any).parentId || '') !== String(req.userId)) {
        res.status(403).json({ error: 'Groups can only be created for your customer accounts' });
        return;
      }
      ownerId = targetOwner;
    }
    if (req.userRole !== 'admin') {
      const allowed = await Device.find({ deviceId: { $in: devices || [] }, assignedUserId: ownerId }).select('deviceId').lean();
      if (allowed.length !== (devices || []).length) {
        res.status(403).json({ error: 'Groups can only contain devices assigned to the selected account' });
        return;
      }
    }

    // One device can belong to only one group — the UI disables conflicting
    // devices, but the API must enforce it too.
    if (Array.isArray(devices) && devices.length) {
      const conflict = await Group.findOne({ devices: { $in: devices } }).select('name devices').lean();
      if (conflict) {
        const conflictIds = devices.filter((id: string) => (conflict.devices || []).includes(id));
        res.status(400).json({ error: `Device(s) already belong to group "${conflict.name}": ${conflictIds.join(', ')}. Remove them from that group first.` });
        return;
      }
    }

    const group = new Group({
      name: name.trim(),
      devices: devices || [],
      ownerId: req.userRole === 'admin' ? undefined : ownerId,
    });

    await group.save();
    console.log('Group created successfully:', group);

    // Invalidate group cache on create
    await cacheDelPattern('groups:*');
    await cacheDelPattern('devices:*');

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'create_group',
        targetType: 'group',
        targetId: String(group._id),
        details: { name: group.name, deviceCount: (group.devices || []).length },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

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
      const access = await resolveGroupOwner(req, group);
      if (!access.ok || !access.ownerId) {
        res.status(403).json({ error: 'Access denied: group does not belong to your account' });
        return;
      }
      const allowed = await Device.find({ deviceId: { $in: devices || [] }, assignedUserId: access.ownerId }).select('deviceId').lean();
      if (allowed.length !== (devices || []).length) {
        res.status(403).json({ error: 'Groups can only contain devices assigned to the group owner account' });
        return;
      }
      group.ownerId = new mongoose.Types.ObjectId(access.ownerId);
    }

    // One device can belong to only one group — exclude this group itself
    // so re-saving its existing membership is allowed.
    if (devices !== undefined && Array.isArray(devices) && devices.length) {
      const conflict = await Group.findOne({ _id: { $ne: group._id }, devices: { $in: devices } }).select('name devices').lean();
      if (conflict) {
        const conflictIds = devices.filter((id: string) => (conflict.devices || []).includes(id));
        res.status(400).json({ error: `Device(s) already belong to group "${conflict.name}": ${conflictIds.join(', ')}. Remove them from that group first.` });
        return;
      }
    }

    const previousName = group.name;
    if (name !== undefined) group.name = String(name).trim();
    const previousDevices = devices !== undefined ? [...(group.devices || [])] : null;
    if (devices !== undefined) group.devices = devices;
    await group.save();
    if (previousDevices) {
      await syncScheduleForDevices([...previousDevices, ...(Array.isArray(devices) ? devices : [])]);
    }

    // Invalidate group cache on update
    await cacheDelPattern('groups:*');
    await cacheDelPattern('devices:*');

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'update_group',
        targetType: 'group',
        targetId: req.params.id,
        details: {
          name: group.name,
          ...(name !== undefined ? { previousName } : {}),
          deviceCount: (group.devices || []).length,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

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
    if (req.userRole !== 'admin') {
      const access = await resolveGroupOwner(req, group);
      if (!access.ok) {
        res.status(403).json({ error: 'Access denied: group does not belong to your account' });
        return;
      }
    }
    const affectedDeviceIds = [...(group.devices || [])];
    // Remove schedule templates targeting this group before deleting it
    await ScheduleTemplate.deleteMany({ targetType: 'group', targetId: String(group._id) });
    await group.deleteOne();
    // Rebuild affected device schedules now that group templates are gone.
    await syncScheduleForDevices(affectedDeviceIds);

    // Invalidate group cache on delete
    await cacheDelPattern('groups:*');
    await cacheDelPattern('devices:*');

    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'delete_group',
        targetType: 'group',
        targetId: req.params.id,
        details: { name: group.name, deviceCount: affectedDeviceIds.length },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

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

    let groupOwnerId: string | undefined;
    if (req.userRole !== 'admin') {
      const access = await resolveGroupOwner(req, group);
      if (!access.ok || !access.ownerId) {
        res.status(403).json({ error: 'Access denied: group does not belong to your account' });
        return;
      }
      groupOwnerId = access.ownerId;
    }

    // Get all devices in this group — they must belong to the group's owner
    // account (a customer, when a dealer configures on their behalf).
    const deviceFilter: any = { deviceId: { $in: group.devices } };
    if (req.userRole !== 'admin') deviceFilter.assignedUserId = groupOwnerId;
    const devices = await Device.find(deviceFilter);
    if (devices.length !== group.devices.length) {
      res.status(403).json({ error: 'One or more group devices are not assigned to the group owner account' });
      return;
    }

    if (devices.length === 0) {
      res.status(400).json({ error: 'No devices in this group' });
      return;
    }

    // Monthly assignment-operation quota: 1 group configure = 1 op
    // (regardless of how many devices are in the group). Charged to the
    // group's owner account.
    if (req.userRole !== 'admin' && groupOwnerId) {
      const assignQuota = await checkAssignQuota(groupOwnerId);
      if (!assignQuota.ok) {
        res.status(assignQuota.status || 429).json({ error: assignQuota.error });
        return;
      }
    }

    // Same validation/normalization as single-device config saves: absolute
    // URLs, mediaItems metadata, section field cleaning, legacy mediaUrls.
    const processed = await processConfigForStorage(
      submittedConfig,
      req.userRole === 'admin' ? undefined : groupOwnerId
    );
    if (processed.error || !processed.config) {
      res.status(processed.status || 400).json({ error: processed.error || 'Invalid configuration' });
      return;
    }
    const config = processed.config;

    // Collect all media URLs from config
    const allMediaUrls: string[] = [];
    if (config.sections && Array.isArray(config.sections)) {
      config.sections.forEach((section: any) => {
        if (section.contentType === 'multimedia' && section.mediaUrls) {
          allMediaUrls.push(...section.mediaUrls);
        }
      });
    }

    const previousGroupConfig = group.config
      ? JSON.parse(JSON.stringify(group.config))
      : devices[0]?.config ? JSON.parse(JSON.stringify(devices[0].config)) : null;

    // Apply config to each device in the group
    const io = getSocketInstance();
    // Resolve schedule templates for all devices in 2 queries instead of 2N.
    const templatesByDevice = await getTemplatesForDevices(devices.map((device) => device.deviceId));
    // Per-device media URL sets (incl. schedule profiles) for assignedDevices sync.
    const deviceUrlSets = new Map<string, Set<string>>();
    const updatePromises = devices.map(async (device) => {
      // Store previous config for audit
      const previousConfig = device.config ? JSON.parse(JSON.stringify(device.config)) : null;
      if (previousConfig) delete previousConfig.schedule;

      if (previousConfig && JSON.stringify(previousConfig) !== JSON.stringify(config)) {
        device.configHistory = [
          {
            config: previousConfig,
            configVersion: Number(device.cacheInfo?.configVersion || 0),
            savedAt: new Date(),
            savedBy: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined,
            source: 'group',
          },
          ...(device.configHistory || []),
        ].slice(0, 2) as any;
      }

      // Update device config
      device.config = config;
      await applyScheduleToConfig(device, templatesByDevice.get(device.deviceId) || []);
      deviceUrlSets.set(device.deviceId, getConfiguredMediaUrls(device.config));

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
        mediaTotal: countConfiguredMedia(device.config),
        mediaCached: 0,
        requiredStorageBytes: getConfiguredMediaBytes(device.config),
        onlineOnlySections: (Array.isArray(config.sections) ? config.sections : []).filter((section: any) =>
          (section?.contentType === 'web' && String(section?.webUrl || '').trim()) ||
          (section?.contentType === 'youtube' && String(section?.youtubeUrl || '').trim())
        ).length,
        message: 'Waiting for device to download and apply this group configuration',
        updatedAt: new Date(),
      });

      await device.save();
      await invalidateDevicePaths(device.deviceId);

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

    if (appliedDeviceIds.length > 0) {
      if (req.userRole !== 'admin' && groupOwnerId) {
        await recordAssign(groupOwnerId);
      }
      if (previousGroupConfig && JSON.stringify(previousGroupConfig) !== JSON.stringify(config)) {
        group.configHistory = [
          { config: previousGroupConfig, savedAt: new Date(), savedBy: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined },
          ...(group.configHistory || []),
        ].slice(0, 2) as any;
      }
      group.config = config;
      try {
        await group.save();
        await cacheDelPattern('groups:*');
      } catch (historyError) {
        console.error('Group configuration history save failed after device saves:', historyError);
      }
    }

    try {
      await cacheDelPattern('devices:*');
    } catch (cacheError) {
      console.error('Device cache invalidation failed after group config save:', cacheError);
    }

    // Reconcile media assignment records per device — each device's schedule
    // profiles can reference different media, so a shared URL set would be wrong.
    if (appliedDeviceIds.length > 0) {
      try {
        for (const deviceId of appliedDeviceIds) {
          const selectedUrls = deviceUrlSets.get(deviceId) || new Set<string>();
          const deviceMedia = await Media.find({ assignedDevices: deviceId }).select('_id url');
          await Promise.all(deviceMedia.filter(media => !selectedUrls.has(media.url)).map(media =>
            Media.findByIdAndUpdate(media._id, { $pull: { assignedDevices: deviceId } })
          ));
          if (selectedUrls.size) {
            const selectedMedia = await Media.find({ url: { $in: [...selectedUrls] } });
            await Promise.all(selectedMedia.map(media =>
              Media.findByIdAndUpdate(media._id, { $addToSet: { assignedDevices: deviceId } })
            ));
          }
        }
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

const canAccessGroup = async (group: any, req: AuthRequest): Promise<boolean> => {
  const access = await resolveGroupOwner(req, group);
  return access.ok;
};

const findGroupDevices = async (group: any, req: AuthRequest) => {
  const deviceFilter: any = { deviceId: { $in: group.devices } };
  if (req.userRole !== 'admin') {
    // Devices must belong to the group's owner account (a customer for dealers).
    const access = await resolveGroupOwner(req, group);
    deviceFilter.assignedUserId = access.ownerId || req.effectiveUserId || req.userId;
  }
  return Device.find(deviceFilter);
};

export const triggerGroupEmergency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    if (!(await canAccessGroup(group, req))) {
      res.status(403).json({ error: 'Access denied: group does not belong to your account' });
      return;
    }
    if (!group.devices.length) {
      res.status(400).json({ error: 'No devices in this group' });
      return;
    }

    const emergencyAccess = await resolveGroupOwner(req, group);
    const { alert, error } = await buildEmergencyAlert(
      req.body,
      req.userRole === 'admin' ? undefined : (emergencyAccess.ownerId || req.effectiveUserId || req.userId),
      req.userId
    );
    if (!alert) {
      res.status(400).json({ error: error || 'Invalid emergency alert payload' });
      return;
    }

    const devices = await findGroupDevices(group, req);
    if (devices.length !== group.devices.length) {
      res.status(403).json({ error: 'One or more group devices are not assigned to your account' });
      return;
    }

    const results = await Promise.allSettled(devices.map(async (device) => {
      device.emergencyAlert = { ...alert, triggeredAt: new Date() };
      await device.save();
      await invalidateDevicePaths(device.deviceId);
      pushEmergencyToDevice(device.deviceId, { ...device.emergencyAlert, deviceId: device.deviceId });
      pushEmergencyToUser(device.assignedUserId?.toString(), { deviceId: device.deviceId, action: 'triggered', alert: device.emergencyAlert });
      return device.deviceId;
    }));

    const triggered = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    res.json({
      success: triggered > 0,
      triggered,
      failed,
      message: `Emergency alert sent to ${triggered} device${triggered === 1 ? '' : 's'}${failed ? `, failed on ${failed}` : ''}`,
    });
  } catch (error) {
    console.error('Trigger group emergency error:', error);
    res.status(500).json({ error: 'Failed to trigger group emergency alert' });
  }
};

export const clearGroupEmergency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    if (!(await canAccessGroup(group, req))) {
      res.status(403).json({ error: 'Access denied: group does not belong to your account' });
      return;
    }

    const devices = await findGroupDevices(group, req);
    await Promise.allSettled(devices.map(async (device) => {
      if (!device.emergencyAlert) return;
      device.emergencyAlert = null;
      await device.save();
      await invalidateDevicePaths(device.deviceId);
      pushEmergencyClearToDevice(device.deviceId);
      pushEmergencyToUser(device.assignedUserId?.toString(), { deviceId: device.deviceId, action: 'cleared' });
    }));

    res.json({ success: true, cleared: devices.length });
  } catch (error) {
    console.error('Clear group emergency error:', error);
    res.status(500).json({ error: 'Failed to clear group emergency alert' });
  }
};

export const getGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    if (!(await canAccessGroup(group, req))) {
      res.status(403).json({ error: 'Access denied: group does not belong to your account' });
      return;
    }
    res.json(group);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
};

export const getGroupConfigHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    if (req.userRole !== 'admin') {
      const access = await resolveGroupOwner(req, group);
      if (!access.ok) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }
    res.json({ entries: [...(group.configHistory || [])].slice(0, 2).reverse() });
  } catch (error) {
    console.error('Get group config history error:', error);
    res.status(500).json({ error: 'Failed to fetch group configuration history' });
  }
};
