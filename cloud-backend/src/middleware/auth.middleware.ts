import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env';
import User from '../models/User';
import { cacheGet } from '../config/redis';
import { getDealerScopeUserIds } from '../utils/dealerScope';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  deviceId?: string;
  /** Owner account used for device/group/media ownership. Equals userId for normal users, parentId for sub-users. */
  effectiveUserId?: string;
  isSubUser?: boolean;
  permissions?: {
    devices?: boolean;
    groups?: boolean;
    library?: boolean;
    settings?: boolean;
    subUsers?: boolean;
  };
  resourceAccess?: { devices: string[]; groups: string[] };
  /** Dealer-only: [dealerId, ...customerIds] — every account whose resources the dealer may access. */
  scopeUserIds?: string[];
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

    // Reject tokens blacklisted by /auth/logout. Fails open when Redis is
    // unavailable (cacheGet returns null) so auth never breaks without it.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (await cacheGet(`revoked:${tokenHash}`)) {
      res.status(401).json({ error: 'Session has been logged out' });
      return;
    }

    const user = await User.findById(decoded.userId).select('role parentId permissions resourceAccess');
    if (!user || user.role !== decoded.role) {
      res.status(401).json({ error: 'User session is no longer valid' });
      return;
    }
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    // Sub-user is an explicit role — dealer customers also carry parentId but
    // are full 'user' accounts and must own their data themselves.
    const isSubUser = user.role === 'sub-user';
    req.isSubUser = isSubUser;
    req.effectiveUserId = isSubUser ? String(user.parentId) : decoded.userId;
    if (user.role === 'dealer') {
      req.scopeUserIds = await getDealerScopeUserIds(decoded.userId);
    }
    req.permissions = user.permissions as AuthRequest['permissions'];
    req.resourceAccess = {
      devices: Array.isArray(user.resourceAccess?.devices) ? user.resourceAccess.devices.map(String) : [],
      groups: Array.isArray(user.resourceAccess?.groups) ? user.resourceAccess.groups.map(String) : [],
    };

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
  if (req.userRole !== 'admin' && req.userRole !== 'user' && req.userRole !== 'sub-user' && req.userRole !== 'dealer') {
    res.status(403).json({ error: 'User or admin access required' });
    return;
  }
  next();
};

export const dealerOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.userRole !== 'dealer') {
    res.status(403).json({ error: 'Dealer access required' });
    return;
  }
  next();
};

/** Admin or dealer — used for device CRUD where the controller applies scope checks. */
export const adminOrDealer = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.userRole !== 'admin' && req.userRole !== 'dealer') {
    res.status(403).json({ error: 'Admin or dealer access required' });
    return;
  }
  next();
};

/**
 * Ownership check that understands dealer scope: admins own everything,
 * normal users/sub-users own their effective account, dealers own every
 * account in their customer tree.
 */
export const canAccessOwnedResource = (req: AuthRequest, ownerId: any): boolean => {
  if (req.userRole === 'admin') return true;
  const id = String(ownerId || '');
  if (!id) return false;
  if (id === String(req.effectiveUserId || req.userId)) return true;
  if (req.userRole === 'dealer' && Array.isArray(req.scopeUserIds) && req.scopeUserIds.includes(id)) return true;
  return false;
};

/**
 * Filter value for owner-scoped list queries (assignedUserId / uploadedBy /
 * ownerId): a single id for normal accounts, an $in set for dealers.
 */
export const ownerScopeFilter = (req: AuthRequest): any => {
  if (req.userRole === 'dealer' && Array.isArray(req.scopeUserIds) && req.scopeUserIds.length) {
    return { $in: req.scopeUserIds };
  }
  return req.effectiveUserId || req.userId;
};
