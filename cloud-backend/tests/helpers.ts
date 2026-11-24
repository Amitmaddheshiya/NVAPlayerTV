import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';
import bcrypt from 'bcryptjs';

export const api = () => request(app);

let userCounter = 0;

export const createUser = async (overrides: any = {}) => {
  const { password, ...rest } = overrides;
  const plainPassword = password || 'Test@123';
  userCounter += 1;
  const user = await User.create({
    email: rest.email || `user${Date.now()}_${userCounter}@test.com`,
    password: await bcrypt.hash(plainPassword, 10),
    role: rest.role || 'user',
    ...rest,
  });
  return { user, password: plainPassword };
};

export const loginAs = async (email: string, password: string): Promise<string> => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (!res.body?.token) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token as string;
};

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
