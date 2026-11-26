import { Router } from 'express';
import {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  configureGroup,
  getGroupConfigHistory,
  triggerGroupEmergency,
  clearGroupEmergency,
} from '../controllers/group.controller';
import { auth } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import type { AuthRequest } from '../middleware/auth.middleware';
import type { Response, NextFunction } from 'express';

const router = Router();

// Groups are managed by the owning user/sub-user accounts — dealers only
// manage customers, devices, media and sub-users, never group config.
// Exception: GET routes stay open to dealers because the controller scopes
// results to the dealer tree (needed e.g. for sub-user resource pickers).
const noDealer = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userRole === 'dealer') {
    res.status(403).json({ error: 'Dealers cannot manage groups' });
    return;
  }
  next();
};

router.get('/', auth, requirePermission('groups'), getGroups);
router.get('/:id', auth, requirePermission('groups'), getGroup);
router.post('/', auth, noDealer, requirePermission('groups'), createGroup);
router.put('/:id', auth, noDealer, requirePermission('groups'), updateGroup);
router.delete('/:id', auth, noDealer, requirePermission('groups'), deleteGroup);
router.post('/:id/configure', auth, noDealer, requirePermission('groups'), configureGroup);
router.get('/:id/config-history', auth, noDealer, requirePermission('groups'), getGroupConfigHistory);
router.post('/:id/emergency', auth, noDealer, requirePermission('groups'), triggerGroupEmergency);
router.post('/:id/emergency/clear', auth, noDealer, requirePermission('groups'), clearGroupEmergency);

export default router;
