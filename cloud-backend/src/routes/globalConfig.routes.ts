import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth.middleware';
import { getConfig, updateConfig } from '../controllers/globalConfig.controller';
import {
  uploadLogoFile,
  setGlobalLogo,
  deleteGlobalLogo,
  getResolvedBranding,
  getPublicBranding,
} from '../controllers/branding.controller';

const router = Router();

// Public route for basic config (no auth needed for basic limits)
router.get('/public', getConfig);

// Admin-only routes for config management
router.get('/', auth, adminOnly, getConfig);
router.put('/', auth, adminOnly, updateConfig);

// Branding: admin manages the global logo; any logged-in account reads the
// logo resolved for their role (dealer logo → global fallback).
router.post('/logo', auth, adminOnly, uploadLogoFile, setGlobalLogo);
router.delete('/logo', auth, adminOnly, deleteGlobalLogo);
router.get('/branding', auth, getResolvedBranding);
router.get('/branding/public', getPublicBranding);

export default router;
