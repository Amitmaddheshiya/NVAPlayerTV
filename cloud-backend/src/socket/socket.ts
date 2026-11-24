import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import Device from '../models/Device';
import User from '../models/User';
import { verifyDeviceToken } from '../middleware/auth.middleware';
import { cacheDelPattern } from '../config/redis';

let io: SocketIOServer;

export const initializeSocket = (httpServer: HTTPServer): void => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: ['*', env.FRONTEND_URL],
      methods: ['GET', 'POST'],
    },
  });

  // A client must prove its identity before it can join any device/user/admin room.
  io.use((socket, next) => {
    void (async () => {
      try {
        const token = String(socket.handshake.auth?.token || '');
        if (!token) throw new Error('Authentication required');
        const decoded = jwt.verify(token, env.JWT_SECRET) as { role?: string; userId?: string; deviceId?: string };
        if (decoded.role === 'device' && decoded.deviceId) {
          const verifiedDeviceId = await verifyDeviceToken(token, decoded.deviceId);
          if (!verifiedDeviceId) throw new Error('Device is inactive or unauthorized');
          socket.data.identity = { role: 'device', deviceId: verifiedDeviceId };
        } else if ((decoded.role === 'admin' || decoded.role === 'user' || decoded.role === 'sub-user') && decoded.userId) {
          const user = await User.findById(decoded.userId).select('role parentId');
          if (!user || user.role !== decoded.role) throw new Error('User is inactive or unauthorized');
          socket.data.identity = { role: user.role, userId: String(user._id), parentId: user.parentId ? String(user.parentId) : undefined };
        } else {
          throw new Error('Invalid socket identity');
        }
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error('Socket authentication failed'));
      }
    })();
  });

  io.on('connection', (socket) => {
    const identity = socket.data.identity as { role: string; userId?: string; deviceId?: string; parentId?: string };
    if (identity.role === 'admin') socket.join('admin');
    if ((identity.role === 'user' || identity.role === 'sub-user') && identity.userId) {
      socket.join(`user:${identity.userId}`);
      // Sub-users share the parent account's device/group event stream.
      if (identity.parentId) socket.join(`user:${identity.parentId}`);
    }
    if (identity.role === 'device' && identity.deviceId) socket.join(`device:${identity.deviceId}`);

    socket.on('emergency:dismissed', () => {
      if (identity.role !== 'device' || !identity.deviceId) return;
      const deviceId = identity.deviceId;
      void (async () => {
        try {
          const device = await Device.findOneAndUpdate(
            { deviceId },
            { $set: { emergencyAlert: null } },
            { new: true, projection: { assignedUserId: 1, deviceId: 1 } }
          ).lean();
          const payload = { deviceId, action: 'dismissed' };
          if (device?.assignedUserId) {
            io.to(`user:${device.assignedUserId}`).emit('emergency:status', payload);
          }
          io.to('admin').emit('emergency:status', payload);
        } catch (error) {
          console.error(`Error handling emergency dismiss for device ${deviceId}:`, error);
        }
      })();
    });

    socket.on('disconnect', async () => {
      if (identity.role !== 'device' || !identity.deviceId) return;
      try {
        const room = io.sockets.adapter.rooms.get(`device:${identity.deviceId}`);
        if (!room?.size) {
          const device = await Device.findOneAndUpdate(
            { deviceId: identity.deviceId },
            { status: 'offline', lastSeen: new Date() },
            { new: true }
          ).select('deviceId name assignedUserId status lastSeen appVersion storage');
          await cacheDelPattern('devices:*');
          if (device) pushDeviceHeartbeat(device);
        }
      } catch (error) {
        console.error(`Error updating device ${identity.deviceId} status:`, error);
      }
    });
  });

  console.log('Authenticated Socket.io initialized');
};

// Per-device throttle for heartbeat fan-out. Every heartbeat used to emit to
// admin + user rooms (~667/sec at 40k devices). Status/appVersion/storage
// changes still emit immediately; routine heartbeats emit at most once/minute
// per device, which matches the CMS freshness needs.
const HEARTBEAT_EMIT_INTERVAL_MS = 60_000;
const heartbeatEmitState = new Map<string, { status?: string; appVersion?: string; storageUsed?: number; at: number }>();

export const pushDeviceHeartbeat = (device: any): void => {
  if (!io) return;
  const deviceId = String(device?.deviceId || '');
  if (!deviceId) return;
  const now = Date.now();
  const prev = heartbeatEmitState.get(deviceId);
  const storageUsed = Number(device?.storage?.used ?? -1);
  const statusChanged = !!prev && prev.status !== device.status;
  const metaChanged = !!prev && (prev.appVersion !== device.appVersion || prev.storageUsed !== storageUsed);
  const intervalElapsed = !prev || now - prev.at >= HEARTBEAT_EMIT_INTERVAL_MS;
  if (prev && !statusChanged && !metaChanged && !intervalElapsed) return;
  heartbeatEmitState.set(deviceId, { status: device.status, appVersion: device.appVersion, storageUsed, at: now });

  const payload = {
    deviceId: device.deviceId,
    name: device.name,
    status: device.status,
    lastSeen: device.lastSeen,
    appVersion: device.appVersion,
    storage: device.storage,
  };
  io.to('admin').emit('device:heartbeat', payload);
  if (device.assignedUserId) {
    io.to(`user:${device.assignedUserId}`).emit('device:heartbeat', payload);
  }
};

export const pushConfigToDevice = (deviceId: string, config: any, configVersion = 0): void => {
  if (!io) return;
  io.to(`device:${deviceId}`).emit('config:update', { config, configVersion });
};

export const pushEmergencyToDevice = (deviceId: string, alert: any): void => {
  if (!io) return;
  io.to(`device:${deviceId}`).emit('emergency:alert', alert);
};

export const pushEmergencyClearToDevice = (deviceId: string): void => {
  if (!io) return;
  io.to(`device:${deviceId}`).emit('emergency:alert:clear');
};

export const pushEmergencyToUser = (userId: string | undefined, payload: any): void => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit('emergency:status', payload);
};

export const revokeDeviceSockets = (deviceId: string): void => {
  if (!io) return;
  const room = io.in(`device:${deviceId}`);
  room.emit('device:deactivated');
  room.disconnectSockets(true);
};

export const getSocketInstance = (): SocketIOServer => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
