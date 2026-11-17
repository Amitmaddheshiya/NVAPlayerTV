import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import User from '../models/User';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  deviceId?: string;
}

export const verifyDeviceToken = async (token: string, expectedDeviceId?: string): Promise<string | null> => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { role?: string; deviceId?: string };
    if (decoded.role !== 'device' || !decoded.deviceId) return null;
    if (expectedDeviceId && decoded.deviceId !== expectedDeviceId) return null;
    const device = await (await import('../models/Device')).default.findOne({ deviceId: decoded.deviceId, activated: true }).select('_id');
    return device ? decoded.deviceId : null;
  } catch {
    return null;
  }
};

export const deviceAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Device token required' });
    return;
  }
  const expectedDeviceId = String(req.params.id || req.query.deviceId || '');
  const deviceId = await verifyDeviceToken(token, expectedDeviceId || undefined);
  if (!deviceId) {
    res.status(401).json({ error: 'Invalid or inactive device token' });
    return;
  }
  req.deviceId = deviceId;
  req.userRole = 'device';
  next();
};

export const auth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string };
    const user = await User.findById(decoded.userId).select('role');
    if (!user || user.role !== decoded.role) {
      res.status(401).json({ error: 'User session is no longer valid' });
      return;
    }
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    console.log(`Auth: userId=${req.userId}, role=${req.userRole}`);
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  console.log(`Admin check: userRole=${req.userRole}, userId=${req.userId}`);
  if (req.userRole !== 'admin') {
    console.log('Admin access denied');
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};

export const userOrAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.userRole !== 'admin' && req.userRole !== 'user') {
    res.status(403).json({ error: 'User or admin access required' });
    return;
  }
  next();
};
