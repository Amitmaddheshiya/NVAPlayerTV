import mongoose from 'mongoose';
import env from './env';

const connectDB = async (): Promise<void> => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('URI:', env.MONGODB_URI.substring(0, 50) + '...');
    
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (error: any) {
    console.error(`Error connecting to MongoDB:`);
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    if (error.reason) {
      console.error(`Error reason:`, error.reason);
    }
    process.exit(1);
  }
};

export default connectDB;
