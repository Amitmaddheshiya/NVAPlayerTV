import Device from '../models/Device';
import Group from '../models/Group';
import ScheduleTemplate, { IScheduleTemplate } from '../models/Schedule';
import { getSocketInstance } from '../socket/socket';
import { cacheDelPattern } from '../config/redis';
import { countConfiguredMedia, getConfiguredMediaBytes } from '../utils/configMedia';
import { invalidateDevicePaths } from '../utils/fileAccessCache';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const MODE_PRIORITY: Record<string, number> = {
  dateWise: 40,
  // A time window is more specific than a day-wide rule. For example, a
  // weekday profile remains active outside the window, while a matching
  // time-wise template takes over during that window.
  timeWise: 30,
  dayWise: 20,
  // Legacy fullDay templates stay playable until users migrate/delete them.
  fullDay: 10,
};

const toEntry = (template: IScheduleTemplate) => {
  const s = template.schedule || ({} as any);
  const mode = s.mode || 'fullDay';
  const days = Array.isArray(s.days) && s.days.length ? s.days.map(Number) : ALL_DAYS;
  const startTime = String(s.startTime || '').trim();
  const endTime = String(s.endTime || '').trim();

  const entry: any = {
    id: String(template._id),
    // TV scheduleService matches entries to profiles via profileId.
    profileId: String(template._id),
    enabled: template.enabled !== false,
    priority: MODE_PRIORITY[mode] ?? 10,
    days,
  };

  if (mode === 'dateWise') {
    entry.dates = Array.isArray(s.dates) ? s.dates.filter(Boolean) : [];
    entry.start = startTime || '00:00';
    entry.end = endTime || '23:59';
  } else if (mode === 'timeWise') {
    entry.start = startTime || '00:00';
    entry.end = endTime || '23:59';
  } else if (mode === 'dayWise' && startTime && endTime) {
    entry.start = startTime;
    entry.end = endTime;
  } else {
    // fullDay, or dayWise without a time range: equal start/end makes the TV
    // engine treat the entry as active for the whole selected day(s).
    entry.start = '00:00';
    entry.end = '00:00';
  }
  return entry;
};

const toProfile = (template: IScheduleTemplate) => {
  const config = JSON.parse(JSON.stringify(template.config || {}));
  delete config.schedule;
  return { id: String(template._id), config };
};

/**
 * Builds the `config.schedule` payload the TV player understands
 * (entries + profiles resolved locally by scheduleService on the device).
 * Returns null when no enabled template applies.
 */
export const buildScheduleConfig = (templates: IScheduleTemplate[]) => {
  const enabled = templates.filter((t) => t.enabled !== false && t.config);
  if (!enabled.length) return null;
  return {
    enabled: true,
    entries: enabled.map(toEntry),
    profiles: enabled.map(toProfile),
    // 'config' = when no schedule entry matches, keep playing the normal
    // (base) configuration instead of the black/image/message fallback.
    fallbackMode: 'config',
    fallbackBgColor: '#000000',
  };
};

/** All enabled templates that can affect a device: direct + via its groups. */
export const getTemplatesForDevice = async (deviceId: string): Promise<IScheduleTemplate[]> => {
  const groups = await Group.find({ devices: deviceId }).select('_id').lean();
  const groupIds = groups.map((g: any) => String(g._id));
  const or: any[] = [{ targetType: 'device', targetId: deviceId }];
  if (groupIds.length) or.push({ targetType: 'group', targetId: { $in: groupIds } });
  const templates = await ScheduleTemplate.find({ enabled: true, $or: or }).lean();
  return templates as unknown as IScheduleTemplate[];
};

/**
 * Batch variant of getTemplatesForDevice: resolves templates for many devices
 * with 2 queries total (one Group scan + one ScheduleTemplate scan) instead of
 * 2 queries per device. Returns a Map keyed by deviceId.
 */
export const getTemplatesForDevices = async (deviceIds: string[]): Promise<Map<string, IScheduleTemplate[]>> => {
  const result = new Map<string, IScheduleTemplate[]>();
  const unique = [...new Set(deviceIds.map(String).filter(Boolean))];
  if (!unique.length) return result;

  const groups = await Group.find({ devices: { $in: unique } }).select('_id devices').lean();
  const deviceToGroupIds = new Map<string, string[]>();
  const allGroupIds = new Set<string>();
  for (const group of groups as any[]) {
    const groupId = String(group._id);
    allGroupIds.add(groupId);
    for (const member of group.devices || []) {
      const key = String(member);
      const list = deviceToGroupIds.get(key) || [];
      list.push(groupId);
      deviceToGroupIds.set(key, list);
    }
  }

  const or: any[] = [{ targetType: 'device', targetId: { $in: unique } }];
  if (allGroupIds.size) or.push({ targetType: 'group', targetId: { $in: [...allGroupIds] } });
  const templates = (await ScheduleTemplate.find({ enabled: true, $or: or }).lean()) as unknown as IScheduleTemplate[];

  for (const deviceId of unique) {
    const groupIds = deviceToGroupIds.get(deviceId) || [];
    result.set(deviceId, templates.filter((t) =>
      (t.targetType === 'device' && String(t.targetId) === deviceId) ||
      (t.targetType === 'group' && groupIds.includes(String(t.targetId)))
    ));
  }
  return result;
};

const scheduleSignature = (schedule: any) => JSON.stringify(schedule || null);
const deviceScheduleSyncQueue = new Map<string, Promise<void>>();

/**
 * Recomputes config.schedule for one device and pushes it only when it changed.
 * Safe to call after any config/group/template mutation.
 */
export const syncDeviceSchedule = async (deviceOrId: any, options: { push?: boolean } = {}, templates?: IScheduleTemplate[]): Promise<void> => {
  const deviceId = String(typeof deviceOrId === 'string' ? deviceOrId : deviceOrId?.deviceId || '');
  if (!deviceId) return;
  const previousSync = deviceScheduleSyncQueue.get(deviceId) || Promise.resolve();
  const currentSync = previousSync.catch(() => undefined).then(async () => {
    // Always reconcile the latest database snapshot. A queued operation must
    // not write a stale Device document captured before another config save.
    const device = await Device.findOne({ deviceId });
    await reconcileDeviceSchedule(device, deviceId, options, templates);
  });
  deviceScheduleSyncQueue.set(deviceId, currentSync);
  try {
    await currentSync;
  } finally {
    if (deviceScheduleSyncQueue.get(deviceId) === currentSync) deviceScheduleSyncQueue.delete(deviceId);
  }
};

const reconcileDeviceSchedule = async (device: any, deviceId: string, options: { push?: boolean }, templates?: IScheduleTemplate[]): Promise<void> => {
  const push = options.push !== false;
  if (!device) return;
  if (!device.config || typeof device.config !== 'object') return;

  const resolvedTemplates = templates ?? await getTemplatesForDevice(deviceId);
  const nextSchedule = buildScheduleConfig(resolvedTemplates);
  const currentSchedule = (device.config as any).schedule || null;

  if (scheduleSignature(currentSchedule) === scheduleSignature(nextSchedule)) return;

  const config = { ...(device.config as any) };
  if (nextSchedule) {
    config.schedule = nextSchedule;
  } else {
    delete config.schedule;
  }
  device.config = config;

  device.cacheInfo = device.cacheInfo || { configVersion: 0, lastSyncTime: new Date(), cachedMedia: [], totalCacheSize: 0 };
  device.cacheInfo.configVersion += 1;
  device.cacheInfo.lastSyncTime = new Date();
  device.set('health.cloudSync', {
    configVersion: device.cacheInfo.configVersion,
    status: 'pending',
    mediaTotal: countConfiguredMedia(config),
    mediaCached: 0,
    requiredStorageBytes: getConfiguredMediaBytes(config),
    message: nextSchedule ? 'Schedule updated; TV will switch playlists at the configured times' : 'Schedule removed; TV will resume the base configuration',
    updatedAt: new Date(),
  });
  await device.save();
  await invalidateDevicePaths(deviceId);

  if (push) {
    const io = getSocketInstance();
    io.to(`device:${deviceId}`).emit('config:update', { config: device.config, configVersion: device.cacheInfo.configVersion });
  }
};

/** Sync every device affected by a template target (device or group). */
export const syncScheduleForTarget = async (targetType: string, targetId: string): Promise<void> => {
  try {
    let deviceIds: string[] = [];
    if (targetType === 'device') {
      deviceIds = [String(targetId)];
    } else {
      const group = await Group.findById(targetId).select('devices').lean();
      deviceIds = Array.isArray((group as any)?.devices) ? (group as any).devices.map(String) : [];
    }
    const devices = await Device.find({ deviceId: { $in: deviceIds } });
    const templatesByDevice = await getTemplatesForDevices(deviceIds);
    await Promise.all(devices.map((device) => syncDeviceSchedule(device, {}, templatesByDevice.get(device.deviceId) || [])));
    if (devices.length) await cacheDelPattern('devices:*');
  } catch (error) {
    console.error('Schedule sync error for target', targetType, targetId, error);
    throw error;
  }
};

/** Sync a set of devices by their deviceId strings (used after group membership changes). */
export const syncScheduleForDevices = async (deviceIds: string[]): Promise<void> => {
  try {
    const unique = [...new Set(deviceIds.map(String).filter(Boolean))];
    if (!unique.length) return;
    const devices = await Device.find({ deviceId: { $in: unique } });
    const templatesByDevice = await getTemplatesForDevices(unique);
    await Promise.all(devices.map((device) => syncDeviceSchedule(device, {}, templatesByDevice.get(device.deviceId) || [])));
    if (devices.length) await cacheDelPattern('devices:*');
  } catch (error) {
    console.error('Schedule sync error for devices', deviceIds, error);
    throw error;
  }
};

/** Re-inject schedule into a freshly saved device config without bumping version again. */
export const applyScheduleToConfig = async (device: any, templates?: IScheduleTemplate[]): Promise<void> => {
  if (!device?.config) return;
  const resolvedTemplates = templates ?? await getTemplatesForDevice(device.deviceId);
  const nextSchedule = buildScheduleConfig(resolvedTemplates);
  const config = { ...(device.config as any) };
  if (nextSchedule) {
    config.schedule = nextSchedule;
  } else {
    delete config.schedule;
  }
  device.config = config;
};
