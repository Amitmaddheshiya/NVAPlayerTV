const mongoose = require('mongoose');
const User = require('../src/models/User');

require('dotenv').config({ path: '.env' });

const makeAdmin = async (email) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/signage-cms');
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found with email:', email);
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();
    console.log(`User ${email} updated to admin role`);
    console.log('User:', { email: user.email, role: user.role });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

// Get email from command line or use default
const email = process.argv[2] || 'admin@example.com';
makeAdmin(email);
