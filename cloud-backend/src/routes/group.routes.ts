import { Router } from 'express';
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  configureGroup,
  getGroupConfigHistory,
} from '../controllers/group.controller';
import { auth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', auth, getGroups);
router.post('/', auth, createGroup);
router.put('/:id', auth, updateGroup);
router.delete('/:id', auth, deleteGroup);
router.post('/:id/configure', auth, configureGroup);
router.get('/:id/config-history', auth, getGroupConfigHistory);

export default router;
