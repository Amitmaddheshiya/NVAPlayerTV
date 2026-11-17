import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import GlobalConfig from '../models/GlobalConfig';
import {
  uploadMedia,
  getMedia,
  getMediaList,
  deleteMedia,
  assignMedia,
  updateMedia,
  getMediaStats,
} from '../controllers/media.controller';
import { adminOnly, auth, deviceAuth } from '../middleware/auth.middleware';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.resolve(process.cwd(), 'uploads/temp');
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const supportedMimeTypes: Record<string, string[]> = {
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'],
  '.gif': ['image/gif'], '.webp': ['image/webp'], '.bmp': ['image/bmp', 'image/x-ms-bmp'],
  '.mp4': ['video/mp4'], '.m4v': ['video/x-m4v', 'video/mp4'],
  '.mov': ['video/quicktime'], '.mkv': ['video/x-matroska', 'video/mkv', 'application/x-matroska'],
  '.webm': ['video/webm'], '.avi': ['video/x-msvideo', 'video/avi', 'video/msvideo'],
  '.3gp': ['video/3gpp'], '.mpg': ['video/mpeg'], '.mpeg': ['video/mpeg'],
  '.pdf': ['application/pdf'],
};

const mediaFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const accepted = supportedMimeTypes[extension];
    const mime = String(file.mimetype || '').toLowerCase();
    if (!accepted || (!accepted.includes(mime) && mime !== 'application/octet-stream')) {
      cb(new Error('Unsupported media type. Use JPG, PNG, GIF, WebP, BMP, MP4, M4V, MOV, MKV, WebM, AVI, 3GP, MPG, MPEG, or PDF.'));
      return;
    }
    file.mimetype = accepted[0];
    cb(null, true);
};

const uploadMediaFile = (req: any, res: any, next: any) => {
  void (async () => {
    const config = await (GlobalConfig as any).getConfig();
    const configuredLimitMB = Number(config.singleUploadLimitMB || 500);
    const maxBytes = Math.max(1, configuredLimitMB) * 1024 * 1024;
    multer({ storage, fileFilter: mediaFileFilter, limits: { fileSize: maxBytes } }).single('file')(req, res, (error: any) => {
      if (error) {
        const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: status === 413 ? `File exceeds the ${configuredLimitMB} MB upload limit` : error.message });
        return;
      }
      next();
    });
  })().catch(next);
};

router.post('/upload', auth, uploadMediaFile, uploadMedia);
router.get('/stats', auth, adminOnly, getMediaStats);
router.get('/', auth, getMedia);
router.get('/media-list', deviceAuth, getMediaList);
router.delete('/:id', auth, deleteMedia);
router.post('/:id/assign', auth, assignMedia);
router.put('/:id', auth, updateMedia);

export default router;
