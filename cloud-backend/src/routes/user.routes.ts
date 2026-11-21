import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import {
  getUsers,
  getUser,
  getMe,
  createUser,
  updateUser,
  deleteUser,
  assignDevices,
  getUserStats,
  updateProfile,
  changePassword,
  getSubUsers,
  createSubUser,
  updateSubUser,
  deleteSubUser,
} from '../controllers/user.controller';

const router = Router();

// User profile route (for authenticated users to get their own profile)
router.get('/me', auth, getMe);
router.put('/me', auth, requirePermission('settings'), updateProfile);
router.post('/me/change-password', auth, requirePermission('settings'), changePassword);

// Sub-user management (parent 'user' accounts only; enforced in controller)
router.get('/me/sub-users', auth, getSubUsers);
router.post('/me/sub-users', auth, createSubUser);
router.put('/me/sub-users/:id', auth, updateSubUser);
router.delete('/me/sub-users/:id', auth, deleteSubUser);

// Admin-only routes (require auth + admin role)
router.get('/', auth, adminOnly, getUsers);
router.get('/:id', auth, adminOnly, getUser);
router.get('/:id/stats', auth, adminOnly, getUserStats);
router.post('/', auth, adminOnly, createUser);
router.put('/:id', auth, adminOnly, updateUser);
router.delete('/:id', auth, adminOnly, deleteUser);
router.post('/:id/devices', auth, adminOnly, assignDevices);

export default router;
