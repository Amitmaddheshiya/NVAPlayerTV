import { Request, Response, NextFunction } from 'express';
import Media from '../models/Media';
import Device from '../models/Device';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { getMediaPathFromUrl } from '../utils/mediaUrl';
import { getDealerScopeUserIds } from '../utils/dealerScope';
import {
  getCachedMediaAuth,
  setCachedMediaAuth,
  getCachedDevicePaths,
  setCachedDevicePaths,
  isDeviceActiveCached,
  markDeviceActive,
} from '../utils/fileAccessCache';

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

    // Find media by path — cached (path index is hot: every range request).
    // uploadedBy gates user access; storageType routes delivery (local vs S3/CDN).
    let mediaUploadedBy: string | undefined;
    let mediaStorageType: string | undefined;
    const cachedMedia = await getCachedMediaAuth(filePath);
    if (cachedMedia) {
      mediaUploadedBy = cachedMedia.uploadedBy || undefined;
      mediaStorageType = cachedMedia.storageType || undefined;
    } else {
      const media = await Media.findOne({ path: filePath }).select('path uploadedBy storageType');
      if (!media) {
        return res.status(404).json({ error: 'File not found' });
      }
      mediaUploadedBy = media.uploadedBy?.toString();
      mediaStorageType = media.storageType || undefined;
      await setCachedMediaAuth(filePath, mediaUploadedBy, mediaStorageType);
    }
    (req as any).mediaFilePath = filePath;
    (req as any).mediaStorageType = mediaStorageType;

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
      const decodedDeviceId = String(decoded.deviceId || '');
      const requestedDeviceId = String(req.query.deviceId || '');
      if (!decodedDeviceId || (requestedDeviceId && requestedDeviceId !== decodedDeviceId)) {
        return res.status(401).json({ error: 'Device is inactive or unauthorized' });
      }
      const deviceId = decodedDeviceId;

      // Activated check — cached briefly; explicit invalidation on
      // deactivate/delete keeps this near-instant.
      let deviceActive = await isDeviceActiveCached(deviceId);
      if (deviceActive === null) {
        const activeDevice = await Device.findOne({ deviceId, activated: true }).select('_id');
        deviceActive = !!activeDevice;
        if (deviceActive) await markDeviceActive(deviceId);
      }
      if (!deviceActive) {
        return res.status(401).json({ error: 'Device is inactive or unauthorized' });
      }

      // Allowed media paths for this device — cached; invalidated on every
      // config/emergency write (updateConfig, configureGroup, schedule sync,
      // emergency trigger/clear, assignment reset, user deletion).
      let configuredPaths = await getCachedDevicePaths(deviceId);
      if (!configuredPaths) {
        const device = await Device.findOne({ deviceId, activated: true }).select('config emergencyAlert');
        if (!device) {
          return res.status(401).json({ error: 'Device is inactive or unauthorized' });
        }
        const configuredUrls = [
          ...(Array.isArray(device?.config?.mediaUrls) ? device.config.mediaUrls : []),
          ...(Array.isArray(device?.config?.sections) ? device.config.sections.flatMap((section: any) =>
            section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : []
          ) : []),
          // Scheduled profile media is downloaded and cached alongside the base
          // playlist. Authorize those URLs using the same device configuration
          // snapshot so a schedule-only asset is not rejected with HTTP 403.
          ...(Array.isArray((device?.config as any)?.schedule?.profiles)
            ? (device!.config as any).schedule.profiles.flatMap((profile: any) => [
                ...(Array.isArray(profile?.config?.mediaUrls) ? profile.config.mediaUrls : []),
                ...(Array.isArray(profile?.config?.sections) ? profile.config.sections.flatMap((section: any) =>
                  section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : []
                ) : []),
              ])
            : []),
        ];
        const emergencyMediaUrl = (device as any)?.emergencyAlert?.active ? String((device as any).emergencyAlert.mediaUrl || '') : '';
        if (emergencyMediaUrl) configuredUrls.push(emergencyMediaUrl);
        configuredPaths = configuredUrls.map((url: string) => getMediaPathFromUrl(url)).filter(Boolean) as string[];
        await setCachedDevicePaths(deviceId, configuredPaths);
      }
      if (!configuredPaths.includes(filePath)) {
        return res.status(403).json({ error: 'Device is not configured to access this file' });
      }
      res.setHeader('Cache-Control', 'private, no-store');
      (req as any).deviceId = deviceId;
      return next();
    }

    if (decoded?.role !== 'admin' && decoded?.role !== 'user' && decoded?.role !== 'sub-user' && decoded?.role !== 'dealer') {
      return res.status(401).json({ error: 'Invalid token role' });
    }
    const user = await User.findById(decoded.userId).select('role parentId');
    if (!user || user.role !== decoded.role) return res.status(401).json({ error: 'User session is no longer valid' });
    if (decoded.role === 'dealer') {
      // Dealers may preview media uploaded by any account in their tree.
      const scope = await getDealerScopeUserIds(String(user._id));
      if (!mediaUploadedBy || !scope.includes(mediaUploadedBy)) {
        return res.status(403).json({ error: 'Access denied - you do not have permission to access this file' });
      }
    } else {
      const effectiveUserId = user.parentId ? String(user.parentId) : String(user._id);
      if (decoded.role !== 'admin' && mediaUploadedBy !== effectiveUserId) {
        return res.status(403).json({ error: 'Access denied - you do not have permission to access this file' });
      }
      (req as any).effectiveUserId = effectiveUserId;
    }
    (req as any).userId = decoded.userId;
    (req as any).userRole = decoded.role;
    next();
  } catch (error) {
    console.error('File access auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
