import { Router } from 'express';
import { register, login, logout } from '../controllers/auth.controller';
import { auth } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.post('/logout', auth, logout);

export default router;
