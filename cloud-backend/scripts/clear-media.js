const mongoose = require('mongoose');
require('dotenv').config();

async function clearMedia() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nvaplayer');
    console.log('Connected to MongoDB');

    // Get the media collection directly
    const db = mongoose.connection.db;
    const mediaCollection = db.collection('media');

    console.log('Counting media documents...');
    const count = await mediaCollection.countDocuments();
    console.log(`Total media documents: ${count}`);

    if (count === 0) {
      console.log('No media documents to delete');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('Deleting all media documents...');
    const result = await mediaCollection.deleteMany({});
    console.log(`Deleted ${result.deletedCount} media documents`);

    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

clearMedia();
