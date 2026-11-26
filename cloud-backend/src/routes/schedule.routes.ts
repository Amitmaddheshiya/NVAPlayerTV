import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import type { AuthRequest } from '../middleware/auth.middleware';
import type { Response, NextFunction } from 'express';
import {
  getScheduleTemplates,
  createScheduleTemplate,
  updateScheduleTemplate,
  deleteScheduleTemplate,
} from '../controllers/schedule.controller';

const router = Router();

// Schedules belong to the owning user/sub-user accounts — dealers manage
// customers/devices/media/sub-users only, never playback schedules.
const noDealer = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userRole === 'dealer') {
    res.status(403).json({ error: 'Dealers cannot manage schedules' });
    return;
  }
  next();
};

// All schedule routes require authentication; ownership/permission checks are
// enforced per-target inside the controller (device vs group module access).
router.get('/', auth, noDealer, getScheduleTemplates);
router.post('/', auth, noDealer, createScheduleTemplate);
router.put('/:id', auth, noDealer, updateScheduleTemplate);
router.delete('/:id', auth, noDealer, deleteScheduleTemplate);

export default router;
