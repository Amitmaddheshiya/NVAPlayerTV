import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import compression from 'compression';
import connectDB from './config/database';
import env from './config/env';
import { initializeSocket, pushDeviceHeartbeat } from './socket/socket';
import { errorHandler, notFound } from './middleware/error.middleware';
import { fileAccessAuth } from './middleware/fileAccess.middleware';
import { rateLimit } from './middleware/rateLimit.middleware';
import { getRedisClient, closeRedisClient, cacheDelPattern } from './config/redis';
import Device from './models/Device';
import { syncDeviceSchedule } from './services/schedule.service';
import { ensureTestAdmin } from './config/testAdmin';

import authRoutes from './routes/auth.routes';
import deviceRoutes from './routes/device.routes';
import mediaRoutes from './routes/media.routes';
import scheduleRoutes from './routes/schedule.routes';
import groupRoutes from './routes/group.routes';
import userRoutes from './routes/user.routes';
import globalConfigRoutes from './routes/globalConfig.routes';

const app = express();
const httpServer = http.createServer(app);

// Initialize Redis (optional - will fallback to DB if not available)
getRedisClient().catch((err) => {
  console.warn('Redis not available, running without caching:', err.message);
});

// Initialize Socket.io
initializeSocket(httpServer);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://127.0.0.1:52844', 'http://127.0.0.1:54608', env.FRONTEND_URL],
  credentials: true,
}));
app.use(compression({ threshold: 1024 })); // Compress responses > 1KB
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to all API routes
app.use('/api', rateLimit());

// Serve uploaded files with authentication
app.use('/api/media/file', fileAccessAuth, express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/config', globalConfigRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

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
