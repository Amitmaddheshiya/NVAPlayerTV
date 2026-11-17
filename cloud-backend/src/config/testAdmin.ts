import bcrypt from 'bcryptjs';
import User from '../models/User';
import env from './env';

// Development bootstrap credentials. Edit this file to change the local test
// admin account. This account is never auto-created in production.
export const TEST_ADMIN_EMAIL = 'nextviewsignage@gmail.com';
export const TEST_ADMIN_PASSWORD = 'nextView@0408';

export async function ensureTestAdmin(): Promise<void> {
  if (env.NODE_ENV === 'production') return;

  const email = TEST_ADMIN_EMAIL.trim().toLowerCase();
  let user = await User.findOne({ email });
  const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 12);
  if (!user) {
    user = new User({ email, password: passwordHash, role: 'admin' });
  } else {
    user.password = passwordHash;
    user.role = 'admin';
  }
  await user.save();
  console.log(`Development admin account ready: ${email}`);
}
