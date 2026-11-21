import { Request, Response } from 'express';
import Media from '../models/Media';
import { getStorageService } from '../config/storage';
import { AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User';
import GlobalConfig from '../models/GlobalConfig';
import AuditLog from '../models/AuditLog';
import { cacheGet, cacheSet, cacheDelPattern } from '../config/redis';
import Device from '../models/Device';
import { getSocketInstance } from '../socket/socket';
import { getMediaPathFromUrl, normalizeUserFolder } from '../utils/mediaUrl';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import path from 'path';

async function getFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

export const uploadMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { section, deviceId, folder } = req.body;
    const storage = getStorageService();

    const ownerId = req.effectiveUserId || req.userId;
    if (deviceId && req.userRole !== 'admin') {
      const assignedDevice = await Device.findOne({ deviceId, assignedUserId: ownerId }).select('_id');
      if (!assignedDevice) {
        res.status(403).json({ error: 'Media can only be uploaded to a device assigned to your account' });
        return;
      }
    }

    // Validation
    if (section && (isNaN(section) || parseInt(section) < 1)) {
      res.status(400).json({ error: 'Section must be a positive number' });
      return;
    }

    if (folder && typeof folder !== 'string') {
      res.status(400).json({ error: 'Folder must be a string' });
      return;
    }
    const normalizedFolder = normalizeUserFolder(folder);
    if (!normalizedFolder) {
      res.status(400).json({ error: 'Folder path is invalid' });
      return;
    }

    // Get global config for upload limits
    const config = await (GlobalConfig as any).getConfig();
    const singleUploadLimitBytes = config.singleUploadLimitMB * 1024 * 1024;

    // Check single upload limit
    if (req.file.size > singleUploadLimitBytes) {
      res.status(400).json({ error: `File size exceeds limit of ${config.singleUploadLimitMB}MB` });
      return;
    }

    // Check monthly upload limit for non-admin users (use GlobalConfig)
    const uploadUsageMonth = new Date().toISOString().slice(0, 7);
    if (req.userRole !== 'admin' && ownerId) {
      const user = await User.findById(ownerId);
      if (user) {
        if (user.uploadUsageMonth !== uploadUsageMonth) {
          user.uploadUsageMonth = uploadUsageMonth;
          user.currentMonthUpload = 0;
          await user.save();
        }
        const monthlyLimitBytes = config.monthlyUploadLimitGB * 1024 * 1024 * 1024;
        const remainingBytes = monthlyLimitBytes - user.currentMonthUpload;
        const remainingMB = (remainingBytes / 1024 / 1024).toFixed(2);
        if (user.currentMonthUpload + req.file.size > monthlyLimitBytes) {
          res.status(400).json({
            error: `Monthly upload limit exceeded. You have ${remainingMB} MB remaining out of ${config.monthlyUploadLimitGB} GB limit.`
          });
          return;
        }
      }
    }

    const safeOriginalName = path.basename(String(req.file.originalname || 'media'))
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 180) || 'media';
    const filename = `${Date.now()}-${safeOriginalName}`;
    // NEW STRUCTURE: users/{userId}/{folder}/filename or users/{userId}/general/filename
    const userId = ownerId || 'admin';
    const folderName = normalizedFolder;
    const mediaPath = `users/${userId}/${folderName}/${filename}`;

    const sha256 = await getFileSha256(req.file.path);
    await storage.upload(req.file, mediaPath);
    const url = storage.getUrl(mediaPath);

    const media = new Media({
      filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      hash: sha256,
      url,
      storageType: process.env.STORAGE_TYPE === 's3' ? 's3' : 'local',
      path: mediaPath,
      uploadedBy: ownerId,
      assignedDevices: deviceId ? [deviceId] : [],
      section: parseInt(section) || 1,
      folder: folderName,
    });

    await media.save();

    // Update user storage and monthly upload (sub-user uploads count toward parent account)
    if (req.userRole !== 'admin' && ownerId) {
      await User.findByIdAndUpdate(ownerId, {
        $inc: {
          storageUsed: req.file.size,
          currentMonthUpload: req.file.size,
        },
        // This field stores a YYYY-MM string and must never be incremented.
        $set: { uploadUsageMonth },
      }, {
        runValidators: true,
      });
    }

    // Audit log
    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'upload_media',
        targetType: 'media',
        targetId: media._id.toString(),
        details: {
          filename: media.originalName,
          size: media.size,
          folder: folderName,
          deviceId: deviceId || null,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    // Invalidate media cache on upload
    await cacheDelPattern('media:*');

    res.status(201).json(media);
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
};

export const getMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { section, deviceId, page = '1', limit = '10', search, folder, type } = req.query;
    const filter: any = { deletedFromLibrary: { $ne: true } };

    if (section) filter.section = parseInt(section as string);
    if (deviceId) filter.assignedDevices = deviceId;
    if (folder) filter.folder = folder;

    // Search filter - search in filename
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      filter.filename = searchRegex;
    }

    // Type filter - image, video, etc.
    if (type) {
      filter.type = type;
    }

    // Non-admin users can only see their own uploaded media
    // But for the library page, they should see all their media regardless of device assignment
    // Sub-users share the parent account's library.
    if (req.userRole !== 'admin' && req.userId) {
      filter.uploadedBy = req.effectiveUserId || req.userId;
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on filter and pagination
    const cacheKey = `media:${JSON.stringify(filter)}:${req.userRole}:${req.userId || 'admin'}:page:${pageNum}:limit:${limitNum}`;

    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log('[Cache HIT] Media from cache');
      res.json(JSON.parse(cached));
      return;
    }

    // Get total count
    const total = await Media.countDocuments(filter);

    // Get paginated media
    const mediaList = await Media.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    console.log('Get media:', { userRole: req.userRole, userId: req.userId, filter, count: mediaList.length, total, page: pageNum, totalPages });

    // Cache the result (TTL: 30 seconds)
    await cacheSet(cacheKey, JSON.stringify({
      data: mediaList,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }), 30);

    res.json({
      data: mediaList,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
};

export const getMediaStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalMedia, storage] = await Promise.all([
      Media.countDocuments(),
      Media.aggregate([{ $group: { _id: null, totalBytes: { $sum: '$size' } } }]),
    ]);
    res.json({ totalMedia, totalStorage: Number(storage[0]?.totalBytes || 0) });
  } catch (error) {
    console.error('Get media stats error:', error);
    res.status(500).json({ error: 'Failed to fetch media statistics' });
  }
};

export const getMediaList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId;
    if (!deviceId) {
      res.status(401).json({ error: 'Authenticated device required' });
      return;
    }
    const device = await Device.findOne({ deviceId, activated: true }).select('config');
    if (!device) {
      res.status(403).json({ error: 'Device is inactive or not registered' });
      return;
    }
    const configuredUrls = [
      ...(Array.isArray(device.config?.mediaUrls) ? device.config.mediaUrls : []),
      ...(Array.isArray(device.config?.sections) ? device.config.sections.flatMap((section: any) =>
        section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : []
      ) : []),
    ];
    const mediaList = await Media.find({ url: { $in: configuredUrls } }).sort({ createdAt: -1 });
    
    // Transform to format expected by TV app
    const transformed = mediaList.map((media) => ({
      url: media.url,
      filename: media.filename,
      name: media.filename,
      originalName: media.originalName,
      type: media.mimeType,
      size: media.size,
      hash: media.hash,
      section: media.section || 1,
      mtimeMs: (media as any).updatedAt?.getTime() || media.createdAt.getTime(),
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Get media list error:', error);
    res.status(500).json({ error: 'Failed to fetch media list' });
  }
};

export const deleteMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    // Non-admin users can only delete their own media
    if (req.userRole !== 'admin' && media.uploadedBy?.toString() !== (req.effectiveUserId || req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check persisted configurations before removing the backing file. A media
    // asset selected by a saved Cloud playlist must remain recoverable by TV.
    const configuredDevices = await Device.find({
      $or: [
        { 'config.mediaUrls': media.url },
        { 'config.sections.mediaUrls': media.url },
        ...(media.assignedDevices?.length ? [{ deviceId: { $in: media.assignedDevices } }] : []),
      ],
    }).select('deviceId');
    if (configuredDevices.length > 0) {
      // A configured cloud playlist is a durable assignment. Hide the asset
      // from the user's library, but keep its file and DB metadata available
      // so assigned TVs can recover or re-cache it after restart/offline use.
      media.deletedFromLibrary = true;
      await media.save();
      await cacheDelPattern('media:*');
      if (req.userId) {
        await AuditLog.create({
          userId: req.userId,
          action: 'delete_media',
          targetType: 'media',
          targetId: media._id.toString(),
          details: {
            filename: media.originalName,
            size: media.size,
            folder: media.folder,
            retainedForConfiguredDevices: configuredDevices.map((device) => device.deviceId),
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
      }
      res.json({
        success: true,
        archived: true,
        retainedDeviceCount: configuredDevices.length,
        message: `Removed from library; retained for ${configuredDevices.length} saved device configuration(s)`,
      });
      return;
    }

    // No saved device config references the media, so it is safe to remove the
    // stored file and record permanently.
    const storage = getStorageService();
    await storage.delete(media.path);
    await Media.findByIdAndDelete(req.params.id);

    // Invalidate media cache on delete
    await cacheDelPattern('media:*');

    // Update user storage - only subtract from storageUsed, not currentMonthUpload
    // currentMonthUpload should show total activity (upload + delete)
    if (media.uploadedBy) {
      await User.findByIdAndUpdate(media.uploadedBy, {
        $inc: {
          storageUsed: -media.size,
        },
      });
    }

    // Audit log
    if (req.userId) {
      await AuditLog.create({
        userId: req.userId,
        action: 'delete_media',
        targetType: 'media',
        targetId: media._id.toString(),
        details: {
          filename: media.originalName,
          size: media.size,
          folder: media.folder,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
};

export const assignMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceIds, section } = req.body;

    const media = await Media.findById(req.params.id);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    // Non-admin users can only assign their own media
    if (req.userRole !== 'admin' && media.uploadedBy?.toString() !== (req.effectiveUserId || req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!Array.isArray(deviceIds)) {
      res.status(400).json({ error: 'deviceIds must be an array' });
      return;
    }
    if (req.userRole !== 'admin' && deviceIds.length) {
      const ownedDevices = await Device.find({ deviceId: { $in: deviceIds }, assignedUserId: req.effectiveUserId || req.userId }).select('deviceId').lean();
      if (ownedDevices.length !== new Set(deviceIds.map(String)).size) {
        res.status(403).json({ error: 'Media can only be assigned to devices in your account' });
        return;
      }
    }

    media.assignedDevices = deviceIds || [];
    if (section) media.section = section;

    await media.save();

    res.json({ success: true, media });
  } catch (error) {
    console.error('Assign media error:', error);
    res.status(500).json({ error: 'Failed to assign media' });
  }
};

export const updateMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { folder } = req.body;

    const media = await Media.findById(req.params.id);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    // Non-admin users can only update their own media
    if (req.userRole !== 'admin' && media.uploadedBy?.toString() !== (req.effectiveUserId || req.userId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const storage = getStorageService();
    const oldFolder = media.folder || 'general';
    const newFolder = normalizeUserFolder(folder === undefined ? oldFolder : folder);
    if (!newFolder) {
      res.status(400).json({ error: 'Folder path is invalid' });
      return;
    }

    // Update folder if provided and different from current
    if (folder !== undefined && folder !== media.folder) {
      const userId = media.uploadedBy?.toString() || 'admin';
      const oldPath = media.path || `users/${userId}/${oldFolder}/${media.filename}`;
      const newPath = `users/${userId}/${newFolder}/${media.filename}`;

      // Move file in storage
      const fs = require('fs').promises;
      const fullOldPath = `${process.env.UPLOAD_DIR || './uploads'}/${oldPath}`;
      const fullNewPath = `${process.env.UPLOAD_DIR || './uploads'}/${newPath}`;

      // Ensure new directory exists
      const newDir = fullNewPath.substring(0, fullNewPath.lastIndexOf('/'));
      await fs.mkdir(newDir, { recursive: true });

      // Move file
      await fs.rename(fullOldPath, fullNewPath);

      // Update media record
      media.path = newPath;
      media.url = storage.getUrl(newPath);
      media.folder = newFolder;
    }

    await media.save();

    // Invalidate media cache on update
    await cacheDelPattern('media:*');

    res.json({ success: true, media });
  } catch (error) {
    console.error('Update media error:', error);
    res.status(500).json({ error: 'Failed to update media' });
  }
};
