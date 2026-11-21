import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import {
  getScheduleTemplates,
  createScheduleTemplate,
  updateScheduleTemplate,
  deleteScheduleTemplate,
} from '../controllers/schedule.controller';

const router = Router();

// All schedule routes require authentication; ownership/permission checks are
// enforced per-target inside the controller (device vs group module access).
router.get('/', auth, getScheduleTemplates);
router.post('/', auth, createScheduleTemplate);
router.put('/:id', auth, updateScheduleTemplate);
router.delete('/:id', auth, deleteScheduleTemplate);

export default router;
