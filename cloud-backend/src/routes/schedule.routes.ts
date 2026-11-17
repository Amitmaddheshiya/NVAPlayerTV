import { Router } from 'express';
import { adminOnly, auth } from '../middleware/auth.middleware';
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../controllers/schedule.controller';
const router = Router();

router.get('/', auth, adminOnly, getSchedules);
router.post('/', auth, adminOnly, createSchedule);
router.put('/:id', auth, adminOnly, updateSchedule);
router.delete('/:id', auth, adminOnly, deleteSchedule);

export default router;
