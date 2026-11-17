import { Request, Response, NextFunction } from 'express';
import Media from '../models/Media';
import Device from '../models/Device';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { verifyDeviceToken } from './auth.middleware';
import { getMediaPathFromUrl } from '../utils/mediaUrl';

export const fileAccessAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // This middleware is mounted at /api/media/file, so req.path contains only
    // the path relative to that mount point (not the full API prefix).
    let filePath: string;
    try {
      filePath = decodeURIComponent(req.path).replace(/^\/+/, '');
    } catch {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!filePath) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Find media by path
    const media = await Media.findOne({ path: filePath });

    if (!media) {
      return res.status(404).json({ error: 'File not found' });
    }

    // The native TV video component cannot attach HTTP headers to range
    // requests, so Cloud playback may carry its short-lived device JWT in the
    // URL. RNFS downloads and browser requests continue using Authorization.
    const authHeader = req.headers.authorization;
    const queryToken = String(req.query.deviceToken || '');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : queryToken;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (decoded?.role === 'device') {
      const requestedDeviceId = String(req.query.deviceId || decoded.deviceId || '');
      const deviceId = await verifyDeviceToken(token, requestedDeviceId);
      if (!deviceId) return res.status(401).json({ error: 'Device is inactive or unauthorized' });
      const device = await Device.findOne({ deviceId, activated: true }).select('config');
      const configuredUrls = [
        ...(Array.isArray(device?.config?.mediaUrls) ? device.config.mediaUrls : []),
        ...(Array.isArray(device?.config?.sections) ? device.config.sections.flatMap((section: any) =>
          section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : []
        ) : []),
      ];
      const configuredPaths = configuredUrls.map((url: string) => getMediaPathFromUrl(url)).filter(Boolean);
      if (!configuredPaths.includes(media.path)) {
        return res.status(403).json({ error: 'Device is not configured to access this file' });
      }
      res.setHeader('Cache-Control', 'private, no-store');
      (req as any).deviceId = deviceId;
      return next();
    }

    if (decoded?.role !== 'admin' && decoded?.role !== 'user') {
      return res.status(401).json({ error: 'Invalid token role' });
    }
    const user = await User.findById(decoded.userId).select('role');
    if (!user || user.role !== decoded.role) return res.status(401).json({ error: 'User session is no longer valid' });
    if (decoded.role !== 'admin' && media.uploadedBy?.toString() !== decoded.userId) {
      return res.status(403).json({ error: 'Access denied - you do not have permission to access this file' });
    }
    (req as any).userId = decoded.userId;
    (req as any).userRole = decoded.role;
    next();
  } catch (error) {
    console.error('File access auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
