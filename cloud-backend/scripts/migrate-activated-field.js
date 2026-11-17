const { MongoClient } = require('mongodb');
require('dotenv').config();

async function migrate() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/signage-cloud';
    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();
    const devicesCollection = db.collection('devices');

    // Update all devices that don't have activated field
    const result = await devicesCollection.updateMany(
      { activated: { $exists: false } },
      { $set: { activated: false } }
    );

    console.log(`Migration complete: ${result.modifiedCount} devices updated`);

    // Verify
    const devicesWithoutActivated = await devicesCollection.countDocuments({ activated: { $exists: false } });
    console.log(`Devices without activated field: ${devicesWithoutActivated}`);

    await client.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
