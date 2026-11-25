import http from 'http';
import connectDB from './config/database';
import env from './config/env';
import app from './app';
import { initializeSocket, pushDeviceHeartbeat } from './socket/socket';
import { getRedisClient, cacheDelPattern } from './config/redis';
import Device from './models/Device';
import { syncDeviceSchedule } from './services/schedule.service';
import { ensureTestAdmin } from './config/testAdmin';
import { purgeArchivedMedia } from './controllers/media.controller';
import { reconcileStorageUsage } from './services/storageReconcile.service';

const httpServer = http.createServer(app);

// Initialize Redis (optional - will fallback to DB if not available)
getRedisClient().catch((err) => {
  console.warn('Redis not available, running without caching:', err.message);
});

// Initialize Socket.io
initializeSocket(httpServer);

const PORT = env.PORT;
// Do not accept logins or device traffic until the database and test bootstrap
// are ready.
void (async () => {
  await connectDB();
  await ensureTestAdmin();

  // Reconcile devices that already carry a schedule payload. This also clears
  // stale payloads when their templates were deleted while the server was
  // offline, without holding startup open for every device in the database.
  try {
    const devices = await Device.find({ 'config.schedule': { $exists: true } });
    const results = await Promise.allSettled(devices.map((device) => syncDeviceSchedule(device, { push: false })));
    const failures = results.filter((result) => result.status === 'rejected').length;
    if (devices.length) console.log(`[Schedule Repair] Reconciled schedule payloads for ${devices.length} device(s)`);
    if (failures) console.error(`[Schedule Repair] Failed to reconcile ${failures} device(s)`);
  } catch (error) {
    console.error('[Schedule Repair] Failed:', error);
  }

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Frontend URL: ${env.FRONTEND_URL}`);
  });
})();

// Background job to mark devices offline when heartbeats stop
// Runs every 60 seconds to check for devices that haven't sent heartbeat in 2 minutes
const OFFLINE_THRESHOLD_MINUTES = 2;
const CHECK_INTERVAL_SECONDS = 60;

setInterval(async () => {
  try {
    const threshold = new Date();
    threshold.setMinutes(threshold.getMinutes() - OFFLINE_THRESHOLD_MINUTES);

    // Find all devices that are marked online but haven't sent heartbeat recently
    const staleDevices = await Device.find({
        status: 'online',
        lastSeen: { $lt: threshold }
      }).select('deviceId name assignedUserId status lastSeen appVersion storage');

    if (staleDevices.length > 0) {
      await Device.updateMany({ _id: { $in: staleDevices.map((device) => device._id) } }, { status: 'offline' });
      await cacheDelPattern('devices:*');
      console.log(`[Offline Detection] Marked ${staleDevices.length} devices as offline (no heartbeat for ${OFFLINE_THRESHOLD_MINUTES}+ minutes)`);
      for (const device of staleDevices) {
        pushDeviceHeartbeat({ ...device.toObject(), status: 'offline' });
      }
    }
  } catch (error) {
    console.error('[Offline Detection] Error checking device status:', error);
  }
}, CHECK_INTERVAL_SECONDS * 1000);

console.log(`[Offline Detection] Background job running - checking every ${CHECK_INTERVAL_SECONDS}s, marking offline after ${OFFLINE_THRESHOLD_MINUTES}m without heartbeat`);

// Daily purge of archived media past the retention window. Only removes files
// no device config or schedule template still references (in-use files are
// skipped so active playlists never break).
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  purgeArchivedMedia().catch((error) => console.error('[MediaPurge] Job failed:', error));
}, PURGE_INTERVAL_MS);
// Run once shortly after boot so retention is enforced even if the process
// restarts daily (e.g. deploys).
setTimeout(() => {
  purgeArchivedMedia().catch((error) => console.error('[MediaPurge] Boot run failed:', error));
}, 60 * 1000);
console.log('[MediaPurge] Background job scheduled (daily + once after boot)');

// Monthly storage reconciliation: compare user.storageUsed against the actual
// sum of Media.size per owner and repair small drift. Runs daily but only
// acts when the calendar month rolls over (tracked via a module-level marker).
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastReconcileMonth = '';
const runReconcileIfNewMonth = async () => {
  const month = new Date().toISOString().slice(0, 7);
  if (month === lastReconcileMonth) return;
  lastReconcileMonth = month;
  try {
    await reconcileStorageUsage();
  } catch (error) {
    console.error('[StorageReconcile] Job failed:', error);
  }
};
setInterval(() => {
  runReconcileIfNewMonth().catch((error) => console.error('[StorageReconcile] Job failed:', error));
}, RECONCILE_INTERVAL_MS);
// Also run once after boot so a fresh deploy reconciles immediately.
setTimeout(() => {
  runReconcileIfNewMonth().catch((error) => console.error('[StorageReconcile] Boot run failed:', error));
}, 2 * 60 * 1000);
console.log('[StorageReconcile] Background job scheduled (monthly + once after boot)');
