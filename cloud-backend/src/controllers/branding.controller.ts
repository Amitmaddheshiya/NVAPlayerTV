import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User';
import GlobalConfig from '../models/GlobalConfig';
import { getStorageService } from '../config/storage';
import env from '../config/env';
import { resolveDealerForUser } from '../utils/dealerScope';

/**
 * White-label branding: one global logo (admin) + optional per-dealer logo.
 * Files live under `branding/` in the storage backend; DB stores only the
 * filename. Resolution order for any account:
 *   dealer → own logo → global logo
 *   customer/sub-user → their dealer's logo → global logo
 *   admin → global logo
 */

const LOGO_DIR = 'branding';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']);

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.resolve(process.cwd(), 'uploads/temp');
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const logoFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!LOGO_EXTENSIONS.has(ext)) {
    cb(new Error('Logo must be a PNG, JPG, WEBP, GIF, SVG or ICO image'));
    return;
  }
  cb(null, true);
};

export const uploadLogoFile = (req: any, res: any, next: any) => {
  multer({ storage: logoStorage, fileFilter: logoFileFilter, limits: { fileSize: MAX_LOGO_BYTES, files: 1 } })
    .single('file')(req, res, (error: any) => {
      if (error) {
        const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: status === 413 ? 'Logo must be smaller than 2 MB' : error.message });
        return;
      }
      next();
    });
};

const storeLogo = async (file: Express.Multer.File): Promise<string> => {
  const storage = getStorageService();
  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await storage.upload(file, `${LOGO_DIR}/${filename}`);
  return filename;
};

const removeLogoFile = async (filename?: string | null): Promise<void> => {
  if (!filename) return;
  try {
    await getStorageService().delete(`${LOGO_DIR}/${filename}`);
  } catch (error) {
    console.error('Failed to delete old logo file:', error);
  }
};

// ---------- Admin: global logo ----------

export const setGlobalLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No logo file uploaded' });
      return;
    }
    const config = await (GlobalConfig as any).getConfig();
    const filename = await storeLogo(req.file);
    const previous = config.logoUrl;
    config.logoUrl = filename;
    await config.save();
    await removeLogoFile(previous && previous !== filename ? previous : null);
    res.json({ success: true, logoUrl: filename });
  } catch (error) {
    console.error('Set global logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
};

export const deleteGlobalLogo = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await (GlobalConfig as any).getConfig();
    const previous = config.logoUrl;
    config.logoUrl = undefined;
    await config.save();
    await removeLogoFile(previous);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete global logo error:', error);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
};

// ---------- Dealer: own logo ----------

export const setDealerLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.userRole !== 'dealer') {
      res.status(403).json({ error: 'Dealer access required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No logo file uploaded' });
      return;
    }
    const dealer = await User.findById(req.userId).select('logoUrl');
    if (!dealer) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const filename = await storeLogo(req.file);
    const previous = dealer.logoUrl;
    dealer.logoUrl = filename;
    await dealer.save();
    await removeLogoFile(previous && previous !== filename ? previous : null);
    res.json({ success: true, logoUrl: filename });
  } catch (error) {
    console.error('Set dealer logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
};

export const deleteDealerLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.userRole !== 'dealer') {
      res.status(403).json({ error: 'Dealer access required' });
      return;
    }
    const dealer = await User.findById(req.userId).select('logoUrl');
    if (!dealer) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const previous = dealer.logoUrl;
    dealer.logoUrl = undefined;
    await dealer.save();
    await removeLogoFile(previous);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete dealer logo error:', error);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
};

// ---------- Admin: per-dealer logo (for dealer accounts) ----------

export const setUserLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No logo file uploaded' });
      return;
    }
    const user = await User.findById(req.params.id).select('role logoUrl');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.role !== 'dealer') {
      res.status(400).json({ error: 'Logos can only be set on dealer accounts' });
      return;
    }
    const filename = await storeLogo(req.file);
    const previous = user.logoUrl;
    user.logoUrl = filename;
    await user.save();
    await removeLogoFile(previous && previous !== filename ? previous : null);
    res.json({ success: true, logoUrl: filename });
  } catch (error) {
    console.error('Set user logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
};

export const deleteUserLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select('role logoUrl');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.role !== 'dealer') {
      res.status(400).json({ error: 'Logos can only be removed from dealer accounts' });
      return;
    }
    const previous = user.logoUrl;
    user.logoUrl = undefined;
    await user.save();
    await removeLogoFile(previous);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user logo error:', error);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
};

// ---------- Resolved branding for the logged-in account ----------

export const getResolvedBranding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config: any = await (GlobalConfig as any).getConfig();
    const globalLogo = config?.logoUrl || null;
    let logoUrl: string | null = globalLogo;

    if (req.userRole === 'dealer') {
      const dealer = await User.findById(req.userId).select('logoUrl').lean();
      logoUrl = (dealer as any)?.logoUrl || globalLogo;
    } else if (req.userRole === 'user' || req.userRole === 'sub-user') {
      const ownerId = req.isSubUser ? String(req.effectiveUserId || '') : String(req.userId || '');
      const dealer = await resolveDealerForUser(ownerId);
      logoUrl = dealer?.logoUrl || globalLogo;
    }
    // admin → global logo only

    res.json({ logoUrl });
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
};

// Public branding for unauthenticated pages (e.g. login) — global logo only,
// since the visitor's account (and therefore dealer logo) is unknown.
export const getPublicBranding = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config: any = await (GlobalConfig as any).getConfig();
    res.json({ logoUrl: config?.logoUrl || null });
  } catch (error) {
    console.error('Get public branding error:', error);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
};

// ---------- Public logo serving (no auth — <img> tags can't send tokens) ----------

const SAFE_KEY = /^[a-zA-Z0-9._-]+$/;

export const serveBranding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const key = String(req.params.key || '');
    if (!SAFE_KEY.test(key) || key.includes('..')) {
      res.status(400).json({ error: 'Invalid logo key' });
      return;
    }
    const storagePath = `${LOGO_DIR}/${key}`;
    const storage = getStorageService();

    // S3: hand out a short-lived signed URL so bytes come from S3/CloudFront.
    if (storage.getDeliveryUrl) {
      const deliveryUrl = await storage.getDeliveryUrl(storagePath, 86400);
      res.redirect(deliveryUrl);
      return;
    }

    // Local: stream the file directly.
    const filePath = path.resolve(process.cwd(), env.UPLOAD_DIR, storagePath);
    if (!filePath.startsWith(path.resolve(process.cwd(), env.UPLOAD_DIR))) {
      res.status(400).json({ error: 'Invalid logo key' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Logo not found' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Serve branding error:', error);
    res.status(500).json({ error: 'Failed to serve logo' });
  }
};
