import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import env from '../config/env';

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

    console.log('Login attempt for email:', email);

    if (!email || !password) {
      console.log('Missing email or password');
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Lowercase email to match schema lowercase requirement
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.log('User not found for email:', normalizedEmail);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    console.log('User found:', user.email, 'Role:', user.role);

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('Invalid password for email:', normalizedEmail);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    console.log('Password valid, generating token for:', user.email);

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
