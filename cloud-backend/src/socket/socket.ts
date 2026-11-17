import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import Device from '../models/Device';
import User from '../models/User';
import { verifyDeviceToken } from '../middleware/auth.middleware';

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
        } else if ((decoded.role === 'admin' || decoded.role === 'user') && decoded.userId) {
          const user = await User.findById(decoded.userId).select('role');
          if (!user || user.role !== decoded.role) throw new Error('User is inactive or unauthorized');
          socket.data.identity = { role: user.role, userId: String(user._id) };
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
    const identity = socket.data.identity as { role: string; userId?: string; deviceId?: string };
    if (identity.role === 'admin') socket.join('admin');
    if (identity.role === 'user' && identity.userId) socket.join(`user:${identity.userId}`);
    if (identity.role === 'device' && identity.deviceId) socket.join(`device:${identity.deviceId}`);

    socket.on('disconnect', async () => {
      if (identity.role !== 'device' || !identity.deviceId) return;
      try {
        const room = io.sockets.adapter.rooms.get(`device:${identity.deviceId}`);
        if (!room?.size) {
          await Device.findOneAndUpdate(
            { deviceId: identity.deviceId },
            { status: 'offline', lastSeen: new Date() }
          );
        }
      } catch (error) {
        console.error(`Error updating device ${identity.deviceId} status:`, error);
      }
    });
  });

  console.log('Authenticated Socket.io initialized');
};

export const pushDeviceHeartbeat = (device: any): void => {
  if (!io) return;
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
