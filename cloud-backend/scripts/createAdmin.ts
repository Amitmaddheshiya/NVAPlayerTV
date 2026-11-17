import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../src/config/database';
import { ensureTestAdmin } from '../src/config/testAdmin';

dotenv.config();

async function main() {
  try {
    await connectDB();
    await ensureTestAdmin();
  } finally {
    await mongoose.disconnect();
  }
}

void main();
