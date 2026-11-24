import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import GlobalConfig from '../models/GlobalConfig';
import Device from '../models/Device';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { normalizeUserFolder } from '../utils/mediaUrl';
import { uploadMedia } from './media.controller';

const CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_CHUNKS = 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVE_UPLOAD_LIMIT = 5;
const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.m4v', '.mov',
  '.mkv', '.webm', '.avi', '.3gp', '.mpg', '.mpeg', '.pdf',
]);
const CANONICAL_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.avi': 'video/x-msvideo', '.3gp': 'video/3gpp', '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg', '.pdf': 'application/pdf',
};

interface UploadSession {
  uploadId: string;
  ownerId: string;
  ownerRole: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  section?: string;
  deviceId?: string;
  folder?: string;
  receivedChunks: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function safeUploadId(value: unknown): string | null {
  const id = String(value || '');
  return /^[a-f0-9-]{36}$/i.test(id) ? id : null;
}

function getOwnerRoot(req: AuthRequest): string {
  const owner = String(req.userId || '');
  return path.resolve(process.cwd(), 'uploads', 'temp', 'chunked', owner);
}

function getSessionDirectory(req: AuthRequest, uploadId: string): string {
  const root = getOwnerRoot(req);
  const session = path.resolve(root, uploadId);
  if (!session.startsWith(`${root}${path.sep}`)) throw new Error('Invalid upload session path');
  return session;
}

function manifestPath(directory: string): string {
  return path.join(directory, 'session.json');
}

async function saveSession(directory: string, session: UploadSession): Promise<void> {
  const target = manifestPath(directory);
  const temporary = `${target}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(session), 'utf8');
  await fs.promises.rename(temporary, target);
}

async function readSession(req: AuthRequest, uploadId: string): Promise<{ directory: string; session: UploadSession } | null> {
  const directory = getSessionDirectory(req, uploadId);
  try {
    const raw = await fs.promises.readFile(manifestPath(directory), 'utf8');
    const session = JSON.parse(raw) as UploadSession;
    if (session.uploadId !== uploadId || session.ownerId !== String(req.userId || '')) return null;
    if (Date.now() - Number(session.updatedAt || session.createdAt || 0) > SESSION_TTL_MS) {
      await fs.promises.rm(directory, { recursive: true, force: true });
      return null;
    }
    return { directory, session };
  } catch {
    return null;
  }
}

async function removeExpiredSessions(ownerRoot: string): Promise<void> {
  try {
    const entries = await fs.promises.readdir(ownerRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !safeUploadId(entry.name)) continue;
      const directory = path.resolve(ownerRoot, entry.name);
      if (!directory.startsWith(`${ownerRoot}${path.sep}`)) continue;
      try {
        const session = JSON.parse(await fs.promises.readFile(manifestPath(directory), 'utf8')) as UploadSession;
        if (Date.now() - Number(session.updatedAt || session.createdAt || 0) > SESSION_TTL_MS) {
          await fs.promises.rm(directory, { recursive: true, force: true });
        }
      } catch {
        // Remove abandoned or corrupt session directories owned by this user.
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
    }
  } catch {
    // The directory is created by the first upload; no cleanup is needed yet.
  }
}

export async function initializeChunkedUpload(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authenticated user required' });
      return;
    }
    const filename = path.basename(String(req.body?.filename || '').trim());
    const extension = path.extname(filename).toLowerCase();
    const totalSize = Number(req.body?.size || 0);
    const requestedMimeType = String(req.body?.mimeType || 'application/octet-stream').toLowerCase();
    if (!filename || filename.includes('/') || filename.includes('\\') ||
      filename !== String(req.body?.filename || '').trim() || !SUPPORTED_EXTENSIONS.has(extension)) {
      res.status(400).json({ error: 'Unsupported or invalid media filename' });
      return;
    }
    if (!Number.isSafeInteger(totalSize) || totalSize <= 0) {
      res.status(400).json({ error: 'A valid upload size is required' });
      return;
    }
    if (req.body?.section && (!Number.isInteger(Number(req.body.section)) || Number(req.body.section) < 1)) {
      res.status(400).json({ error: 'Section must be a positive number' });
      return;
    }
    const folder = normalizeUserFolder(req.body?.folder);
    if (!folder) {
      res.status(400).json({ error: 'Folder name is invalid' });
      return;
    }
    const deviceId = String(req.body?.deviceId || '');
    const ownerId = req.effectiveUserId || req.userId;
    if (deviceId && req.userRole !== 'admin') {
      const assignedDevice = await Device.findOne({ deviceId, assignedUserId: ownerId }).select('_id');
      if (!assignedDevice) {
        res.status(403).json({ error: 'Media can only be uploaded to a device assigned to your account' });
        return;
      }
    }
    const mimeType = CANONICAL_MIME_TYPES[extension];
    if (
      requestedMimeType.length > 150 ||
      (requestedMimeType !== 'application/octet-stream' && requestedMimeType !== mimeType &&
        !(extension === '.bmp' && requestedMimeType === 'image/x-ms-bmp') &&
        !(extension === '.m4v' && requestedMimeType === 'video/mp4') &&
        !(extension === '.mkv' && requestedMimeType === 'video/mkv') &&
        !(extension === '.avi' && ['video/avi', 'video/msvideo'].includes(requestedMimeType)))
    ) {
      res.status(400).json({ error: 'Invalid media type' });
      return;
    }

    const config = await (GlobalConfig as any).getConfig();
    const maxBytes = Math.max(1, Number(config.singleUploadLimitMB || 2048)) * 1024 * 1024;
    if (totalSize > maxBytes) {
      res.status(413).json({ error: `File exceeds the ${config.singleUploadLimitMB || 2048} MB upload limit` });
      return;
    }
    if (req.userRole !== 'admin') {
      const user = await User.findById(ownerId);
      if (user) {
        const month = new Date().toISOString().slice(0, 7);
        const used = user.uploadUsageMonth === month ? Number(user.currentMonthUpload || 0) : 0;
        const monthlyLimit = Number(config.monthlyUploadLimitGB || 10) * 1024 * 1024 * 1024;
        if (used + totalSize > monthlyLimit) {
          res.status(400).json({ error: 'Monthly upload limit exceeded' });
          return;
        }
        // Early storage-quota check so users don't waste time uploading a
        // file that can never fit. The authoritative check (incl. ops count)
        // runs again in uploadMedia on complete.
        const storageLimitBytes = Number(config.storageLimitGB || 1) * 1024 * 1024 * 1024;
        if (Number(user.storageUsed || 0) + totalSize > storageLimitBytes) {
          res.status(400).json({ error: `Storage limit exceeded. Your library limit is ${config.storageLimitGB} GB.` });
          return;
        }
      }
    }

    const ownerRoot = getOwnerRoot(req);
    await fs.promises.mkdir(ownerRoot, { recursive: true });
    await removeExpiredSessions(ownerRoot);
    const requestedUploadId = safeUploadId(req.body?.uploadId);
    if (requestedUploadId) {
      const existing = await readSession(req, requestedUploadId);
      if (existing) {
        const sameFile = existing.session.filename === filename &&
          existing.session.totalSize === totalSize &&
          existing.session.mimeType === mimeType &&
          String(existing.session.section || '') === String(req.body?.section || '') &&
          String(existing.session.deviceId || '') === deviceId &&
          existing.session.folder === folder;
        if (!sameFile) {
          res.status(409).json({ error: 'Upload ID is already associated with another file' });
          return;
        }
        res.json({
          uploadId: requestedUploadId,
          chunkSize: existing.session.chunkSize,
          totalChunks: existing.session.totalChunks,
          receivedChunks: Object.keys(existing.session.receivedChunks).map(Number),
        });
        return;
      }
    }
    const currentSessions = await fs.promises.readdir(ownerRoot, { withFileTypes: true }).catch(() => []);
    const activeCount = currentSessions.filter((entry) => entry.isDirectory() && safeUploadId(entry.name)).length;
    if (activeCount >= ACTIVE_UPLOAD_LIMIT) {
      res.status(429).json({ error: 'Too many unfinished uploads. Complete or retry an existing upload first.' });
      return;
    }

    const uploadId = requestedUploadId || randomUUID();
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE_BYTES);
    if (totalChunks > MAX_CHUNKS) {
      res.status(413).json({ error: 'Upload is larger than the resumable upload limit' });
      return;
    }
    const directory = getSessionDirectory(req, uploadId);
    await fs.promises.mkdir(directory, { recursive: true });
    const timestamp = Date.now();
    const session: UploadSession = {
      uploadId,
      ownerId: String(req.userId),
      ownerRole: String(req.userRole || 'user'),
      filename,
      mimeType,
      totalSize,
      totalChunks,
      chunkSize: CHUNK_SIZE_BYTES,
      section: req.body?.section ? String(req.body.section) : undefined,
      deviceId: deviceId || undefined,
      folder,
      receivedChunks: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await saveSession(directory, session);
    res.status(201).json({ uploadId, chunkSize: CHUNK_SIZE_BYTES, totalChunks, receivedChunks: [] });
  } catch (error) {
    console.error('Initialize chunked upload error:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
}

export async function getChunkedUploadStatus(req: AuthRequest, res: Response): Promise<void> {
  const uploadId = safeUploadId(req.params.uploadId);
  if (!uploadId) {
    res.status(400).json({ error: 'Invalid upload ID' });
    return;
  }
  const found = await readSession(req, uploadId);
  if (!found) {
    res.status(404).json({ error: 'Upload session not found or expired' });
    return;
  }
  res.json({
    uploadId,
    filename: found.session.filename,
    totalSize: found.session.totalSize,
    chunkSize: found.session.chunkSize,
    totalChunks: found.session.totalChunks,
    receivedChunks: Object.keys(found.session.receivedChunks).map(Number),
  });
}

export async function cancelChunkedUpload(req: AuthRequest, res: Response): Promise<void> {
  const uploadId = safeUploadId(req.params.uploadId);
  if (!uploadId) {
    res.status(400).json({ error: 'Invalid upload ID' });
    return;
  }
  const found = await readSession(req, uploadId);
  if (!found) {
    res.status(404).json({ error: 'Upload session not found or expired' });
    return;
  }
  await fs.promises.rm(found.directory, { recursive: true, force: true });
  res.json({ success: true });
}

export async function uploadChunk(req: AuthRequest, res: Response): Promise<void> {
  const discardTemporaryChunk = () => req.file?.path
    ? fs.promises.unlink(req.file.path).catch(() => undefined)
    : Promise.resolve();
  const uploadId = safeUploadId(req.params.uploadId);
  const index = Number(req.params.index);
  if (!uploadId || !Number.isInteger(index) || index < 0) {
    await discardTemporaryChunk();
    res.status(400).json({ error: 'Invalid upload ID or chunk index' });
    return;
  }
  const found = await readSession(req, uploadId);
  if (!found) {
    await discardTemporaryChunk();
    res.status(404).json({ error: 'Upload session not found or expired' });
    return;
  }
  const { session, directory } = found;
  if (index >= session.totalChunks) {
    await discardTemporaryChunk();
    res.status(400).json({ error: 'Chunk index exceeds upload size' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'No upload chunk received' });
    return;
  }
  const expectedSize = Math.min(session.chunkSize, session.totalSize - index * session.chunkSize);
  if (Number(req.file.size) !== expectedSize) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    res.status(400).json({ error: 'Chunk size does not match the upload manifest' });
    return;
  }
  const expectedHash = String(req.body?.sha256 || '').toLowerCase();
  if (expectedHash) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ error: 'Invalid chunk checksum' });
      return;
    }
    try {
      const actualHash = await new Promise<string>((resolve, reject) => {
        const hash = createHash('sha256');
        const input = fs.createReadStream(req.file!.path);
        input.on('data', (chunk) => hash.update(chunk));
        input.on('error', reject);
        input.on('end', () => resolve(hash.digest('hex')));
      });
      if (actualHash !== expectedHash) {
        await fs.promises.unlink(req.file.path).catch(() => undefined);
        res.status(400).json({ error: 'Chunk checksum mismatch; retry the chunk' });
        return;
      }
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      console.error('Chunk checksum verification failed:', error);
      res.status(500).json({ error: 'Failed to verify upload chunk' });
      return;
    }
  }
  const target = path.join(directory, `chunk-${String(index).padStart(6, '0')}.part`);
  try {
    if (session.receivedChunks[String(index)] === expectedSize) {
      try {
        const existing = await fs.promises.stat(target);
        if (Number(existing.size) === expectedSize) {
          await fs.promises.unlink(req.file.path).catch(() => undefined);
          res.json({ uploadId, index, received: true, duplicate: true });
          return;
        }
      } catch {
        // The manifest may outlive a missing chunk; accept the retry below.
      }
      delete session.receivedChunks[String(index)];
      await saveSession(directory, session);
    }
    await fs.promises.unlink(target).catch(() => undefined);
    await fs.promises.rename(req.file.path, target);
    session.receivedChunks[String(index)] = expectedSize;
    session.updatedAt = Date.now();
    await saveSession(directory, session);
    res.json({ uploadId, index, received: true });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    console.error('Upload chunk error:', error);
    res.status(500).json({ error: 'Failed to store upload chunk' });
  }
}

export async function completeChunkedUpload(req: AuthRequest, res: Response): Promise<void> {
  const uploadId = safeUploadId(req.params.uploadId);
  if (!uploadId) {
    res.status(400).json({ error: 'Invalid upload ID' });
    return;
  }
  const found = await readSession(req, uploadId);
  if (!found) {
    res.status(404).json({ error: 'Upload session not found or expired' });
    return;
  }
  const { directory, session } = found;
  const missing = Array.from({ length: session.totalChunks }, (_, index) => index).filter(
    (index) => session.receivedChunks[String(index)] !== Math.min(session.chunkSize, session.totalSize - index * session.chunkSize)
  );
  if (missing.length) {
    res.status(409).json({ error: 'Upload is incomplete', missingChunks: missing });
    return;
  }

  const assembledPath = path.join(directory, 'assembled.upload');
  try {
    await fs.promises.unlink(assembledPath).catch(() => undefined);
    for (let index = 0; index < session.totalChunks; index += 1) {
      const partPath = path.join(directory, `chunk-${String(index).padStart(6, '0')}.part`);
      await pipeline(
        fs.createReadStream(partPath),
        fs.createWriteStream(assembledPath, { flags: index === 0 ? 'w' : 'a' })
      );
    }
    const stat = await fs.promises.stat(assembledPath);
    if (Number(stat.size) !== session.totalSize) {
      res.status(400).json({ error: 'Assembled upload size does not match original file' });
      return;
    }

    // Optional whole-file integrity check: the CMS streams a SHA-256 of the
    // original file while uploading chunks. Per-chunk hashes already guard
    // transport; this catches assembly/storage corruption end-to-end.
    const expectedFileHash = String(req.body?.fileHash || '').toLowerCase();
    if (expectedFileHash) {
      if (!/^[a-f0-9]{64}$/.test(expectedFileHash)) {
        res.status(400).json({ error: 'Invalid file checksum' });
        return;
      }
      const actualFileHash = await hashFileSha256(assembledPath);
      if (actualFileHash !== expectedFileHash) {
        res.status(400).json({ error: 'File checksum mismatch; upload rejected' });
        return;
      }
    }

    req.body = {
      section: session.section,
      deviceId: session.deviceId,
      folder: session.folder,
    };
    (req as any).file = {
      path: assembledPath,
      originalname: session.filename,
      mimetype: session.mimeType,
      size: session.totalSize,
    };
    await uploadMedia(req, res);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await fs.promises.rm(directory, { recursive: true, force: true }).catch((error) => {
        console.warn('Completed upload session cleanup failed:', error);
      });
    }
  } catch (error) {
    console.error('Complete chunked upload error:', error);
    res.status(500).json({ error: 'Failed to assemble upload' });
  }
}
