import bcrypt from 'bcryptjs';
import User from '../models/User';
import env from './env';

// Development bootstrap credentials. The password comes from DEV_ADMIN_PASSWORD
// in .env — never hardcode credentials in source. This account is never
// auto-created in production.
export const TEST_ADMIN_EMAIL = 'nextviewsignage@gmail.com';

export async function ensureTestAdmin(): Promise<void> {
  if (env.NODE_ENV === 'production') return;

  const password = process.env.DEV_ADMIN_PASSWORD;
  if (!password) {
    console.warn('DEV_ADMIN_PASSWORD is not set — skipping development admin bootstrap. Add it to cloud-backend/.env to enable the local test admin.');
    return;
  }

  const email = TEST_ADMIN_EMAIL.trim().toLowerCase();
  let user = await User.findOne({ email });
  const passwordHash = await bcrypt.hash(password, 12);
  if (!user) {
    user = new User({ email, password: passwordHash, role: 'admin' });
  } else {
    user.password = passwordHash;
    user.role = 'admin';
  }
  await user.save();
  console.log(`Development admin account ready: ${email}`);
}
