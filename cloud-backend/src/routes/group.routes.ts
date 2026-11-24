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

const router = Router();

router.get('/', auth, requirePermission('groups'), getGroups);
router.get('/:id', auth, requirePermission('groups'), getGroup);
router.post('/', auth, requirePermission('groups'), createGroup);
router.put('/:id', auth, requirePermission('groups'), updateGroup);
router.delete('/:id', auth, requirePermission('groups'), deleteGroup);
router.post('/:id/configure', auth, requirePermission('groups'), configureGroup);
router.get('/:id/config-history', auth, requirePermission('groups'), getGroupConfigHistory);
router.post('/:id/emergency', auth, requirePermission('groups'), triggerGroupEmergency);
router.post('/:id/emergency/clear', auth, requirePermission('groups'), clearGroupEmergency);

export default router;
