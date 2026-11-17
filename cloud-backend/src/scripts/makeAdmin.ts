import mongoose from 'mongoose';
import User from '../models/User';

const makeAdmin = async (email: string) => {
  try {
    await mongoose.connect('mongodb://localhost:27017/signage-cms');
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found with email:', email);
      console.log('Available users:');
      const allUsers = await User.find().select('email role');
      allUsers.forEach(u => console.log(`- ${u.email} (${u.role})`));
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();
    console.log(`✓ User ${email} updated to admin role`);
    console.log('User:', { email: user.email, role: user.role });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

// Get email from command line
const email = process.argv[2];
if (!email) {
  console.log('Usage: npx ts-node src/scripts/makeAdmin.ts <email>');
  console.log('Listing all users:');
  mongoose.connect('mongodb://localhost:27017/signage-cms').then(async () => {
    const allUsers = await User.find().select('email role');
    allUsers.forEach(u => console.log(`- ${u.email} (${u.role})`));
    mongoose.connection.close();
  });
} else {
  makeAdmin(email);
}
