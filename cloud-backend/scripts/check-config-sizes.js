/**
 * Measures the largest stored config payloads to size the express.json()
 * body limit correctly. Run: node scripts/check-config-sizes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  for (const [coll, field] of [['devices', 'config'], ['groups', 'config'], ['scheduletemplates', 'config']]) {
    const collection = db.collection(coll);
    const total = await collection.countDocuments();
    // Sample the largest docs by config size using aggregation on BSON size.
    const biggest = await collection
      .aggregate([
        { $project: { size: { $bsonSize: `$${field}` } } },
        { $sort: { size: -1 } },
        { $limit: 5 },
      ])
      .toArray();
    console.log(`\n${coll}.${field} — total docs: ${total}`);
    biggest.forEach((d, i) => console.log(`  #${i + 1}: ${kb(d.size)}`));
    if (!biggest.length) console.log('  (no docs)');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('check-config-sizes failed:', err);
  process.exit(1);
});
