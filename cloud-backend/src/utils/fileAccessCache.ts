import { cacheGet, cacheSet, cacheDel } from '../config/redis';

/**
 * Redis cache for the fileAccessAuth hot path.
 *
 * Every media range request previously cost 3-4 Mongo queries:
 *   Media.findOne({path}) + Device.findOne (verifyDeviceToken)
 *   + Device.findOne (config scan for allowed paths).
 *
 * Cached entries:
 *   fileauth:media:{path}        -> { uploadedBy }        TTL 300s
 *   fileauth:devicepaths:{id}    -> string[] (allowed media paths) TTL 60s
 *   fileauth:deviceactive:{id}   -> '1' (activated)       TTL 30s
 *
 * All helpers degrade gracefully: Redis down/missing => cache miss => DB fallback.
 * Every writer that mutates media.path/uploadedBy, device.config,
 * device.emergencyAlert or device.activated MUST call the matching invalidate*
 * helper (see call sites in controllers and schedule.service).
 */

const MEDIA_AUTH_TTL = 300;
const DEVICE_PATHS_TTL = 60;
const DEVICE_ACTIVE_TTL = 30;

const mediaKey = (path: string) => `fileauth:media:${path}`;
const devicePathsKey = (deviceId: string) => `fileauth:devicepaths:${deviceId}`;
const deviceActiveKey = (deviceId: string) => `fileauth:deviceactive:${deviceId}`;

export interface CachedMediaAuth {
  uploadedBy?: string;
  storageType?: string;
}

export async function getCachedMediaAuth(path: string): Promise<CachedMediaAuth | null> {
  const raw = await cacheGet(mediaKey(path));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function setCachedMediaAuth(path: string, uploadedBy?: string, storageType?: string): Promise<void> {
  await cacheSet(mediaKey(path), JSON.stringify({ uploadedBy: uploadedBy || '', storageType: storageType || '' }), MEDIA_AUTH_TTL);
}

export async function invalidateMediaAuth(path: string): Promise<void> {
  if (path) await cacheDel(mediaKey(path));
}

export async function getCachedDevicePaths(deviceId: string): Promise<string[] | null> {
  const raw = await cacheGet(devicePathsKey(deviceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setCachedDevicePaths(deviceId: string, paths: string[]): Promise<void> {
  await cacheSet(devicePathsKey(deviceId), JSON.stringify(paths), DEVICE_PATHS_TTL);
}

export async function invalidateDevicePaths(deviceId: string): Promise<void> {
  if (deviceId) await cacheDel(devicePathsKey(deviceId));
}

/** Returns true/false when known, null when not cached (caller must hit DB). */
export async function isDeviceActiveCached(deviceId: string): Promise<boolean | null> {
  const raw = await cacheGet(deviceActiveKey(deviceId));
  if (raw === null) return null;
  return raw === '1';
}

export async function markDeviceActive(deviceId: string): Promise<void> {
  await cacheSet(deviceActiveKey(deviceId), '1', DEVICE_ACTIVE_TTL);
}

export async function invalidateDeviceActive(deviceId: string): Promise<void> {
  if (deviceId) await cacheDel(deviceActiveKey(deviceId));
}
