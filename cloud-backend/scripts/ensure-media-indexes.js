/**
 * Preflight + create indexes for the media collection.
 *
 * Why this exists: `path` is getting a UNIQUE index. If duplicate paths already
 * exist in the database, createIndex would fail. This script checks for
 * duplicates FIRST and only creates indexes when safe.
 *
 * Usage:
 *   node scripts/ensure-media-indexes.js
 *
 * Rollback (if ever needed):
 *   db.media.dropIndex('path_1')
 *   db.media.dropIndex('url_1')
 */
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Copy env.example to .env first.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const coll = mongoose.connection.db.collection('media');

  console.log('Connected. Running preflight duplicate check on media.path ...');

  const dupes = await coll
    .aggregate([
      { $group: { _id: '$path', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();

  if (dupes.length > 0) {
    console.error(`FOUND ${dupes.length}+ duplicate media.path values. Unique index NOT created.`);
    console.error('Resolve duplicates manually, then re-run this script. Sample:');
    dupes.forEach((d) => console.error(`  path=${d._id} count=${d.count}`));
    await mongoose.disconnect();
    process.exit(2);
  }

  console.log('No duplicate paths found. Creating indexes ...');
  await coll.createIndex({ path: 1 }, { unique: true, name: 'path_1' });
  console.log('  created: path_1 (unique)');
  await coll.createIndex({ url: 1 }, { name: 'url_1' });
  console.log('  created: url_1');

  const indexes = await coll.indexes();
  console.log('Current media indexes:');
  indexes.forEach((i) => console.log(`  ${i.name}: ${JSON.stringify(i.key)}`));

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('ensure-media-indexes failed:', err);
  process.exit(1);
});
