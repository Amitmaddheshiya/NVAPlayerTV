import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import env from '../config/env';
import { cacheSet } from '../config/redis';
import { AuthRequest } from '../middleware/auth.middleware';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email: normalizedEmail,
      password: hashedPassword,
      // Public signup must never grant administrator privileges. Development
      // admin access is provisioned by config/testAdmin.ts instead.
      role: 'user',
    });

    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Lowercase email to match schema lowercase requirement
    const normalizedEmail = String(email).toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.parentId ? 'sub-user' : user.role,
        parentId: user.parentId || null,
        isSubUser: user.role === 'sub-user' || !!user.parentId,
        permissions: user.permissions || null,
        subUserLimit: user.subUserLimit || 0,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Blacklist the presented token until its natural expiry so logout actually
// invalidates the session server-side (JWTs are otherwise valid until exp).
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const ttlSeconds = decoded?.exp
        ? Math.max(1, decoded.exp - Math.floor(Date.now() / 1000))
        : 7 * 24 * 3600;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await cacheSet(`revoked:${tokenHash}`, '1', ttlSeconds);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};
