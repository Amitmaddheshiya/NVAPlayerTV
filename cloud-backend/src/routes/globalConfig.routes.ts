import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth.middleware';
import { getConfig, updateConfig } from '../controllers/globalConfig.controller';

const router = Router();

// Public route for basic config (no auth needed for basic limits)
router.get('/public', getConfig);

// Admin-only routes for config management
router.get('/', auth, adminOnly, getConfig);
router.put('/', auth, adminOnly, updateConfig);

export default router;
