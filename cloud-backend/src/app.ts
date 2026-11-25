import express from 'express';
import cors from 'cors';
import path from 'path';
import compression from 'compression';
import env from './config/env';
import { errorHandler, notFound } from './middleware/error.middleware';
import { fileAccessAuth } from './middleware/fileAccess.middleware';
import { rateLimit } from './middleware/rateLimit.middleware';
import { getStorageService } from './config/storage';

import authRoutes from './routes/auth.routes';
import deviceRoutes from './routes/device.routes';
import mediaRoutes from './routes/media.routes';
import scheduleRoutes from './routes/schedule.routes';
import groupRoutes from './routes/group.routes';
import userRoutes from './routes/user.routes';
import globalConfigRoutes from './routes/globalConfig.routes';

// Express app WITHOUT server listen, socket init or background jobs —
// index.ts wires those up; tests import this directly with supertest.
const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://127.0.0.1:52844', 'http://127.0.0.1:54608', env.FRONTEND_URL],
  credentials: true,
}));
app.use(compression({ threshold: 1024 }));
// 1mb: measured max stored config is <1KB, but schedule profiles embed full
// config snapshots (up to 20 per device) which can approach the 100kb default.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply rate limiting to all API routes
app.use('/api', rateLimit());

// Serve uploaded files with authentication. Local files go through
// express.static (Range-capable); S3 files 302-redirect to a short-lived
// signed URL (S3 presign or CloudFront) so bytes never transit EC2.
const localMediaStatic = express.static(path.join(process.cwd(), 'uploads'));

const serveMediaFile: express.RequestHandler = async (req, res, next) => {
  const storageType = String((req as any).mediaStorageType || '');
  const filePath = String((req as any).mediaFilePath || '');
  if (storageType === 's3' && filePath) {
    try {
      const storage = getStorageService('s3');
      if (storage.getDeliveryUrl) {
        const deliveryUrl = await storage.getDeliveryUrl(filePath);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.redirect(302, deliveryUrl);
      }
    } catch (error) {
      console.error('Media delivery URL error:', error);
      return res.status(502).json({ error: 'Media delivery failed' });
    }
  }
  return localMediaStatic(req, res, next);
};

app.use('/api/media/file', fileAccessAuth, serveMediaFile);

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

export default app;
