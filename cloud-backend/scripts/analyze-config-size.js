/**
 * Measures Device.config storage amplification — how much of each device's
 * config is schedule-profile snapshots vs the base config.
 *
 * Run: node scripts/analyze-config-size.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set'); process.exit(1); }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const total = await db.collection('devices').countDocuments();
  const withConfig = await db.collection('devices').countDocuments({ config: { $exists: true, $ne: null } });
  const withProfiles = await db.collection('devices').countDocuments({ 'config.schedule.profiles.0': { $exists: true } });

  const stats = await db.collection('devices').aggregate([
    { $match: { 'config.schedule.profiles.0': { $exists: true } } },
    {
      $project: {
        cfgSize: { $bsonSize: '$config' },
        schedSize: { $bsonSize: '$config.schedule' },
        profiles: { $size: { $ifNull: ['$config.schedule.profiles', []] } },
      },
    },
    {
      $group: {
        _id: null,
        devices: { $sum: 1 },
        avgCfgBytes: { $avg: '$cfgSize' },
        avgSchedBytes: { $avg: '$schedSize' },
        maxCfgBytes: { $max: '$cfgSize' },
        avgProfiles: { $avg: '$profiles' },
      },
    },
  ]).toArray();

  const s = stats[0] || {};
  console.log('=== Device.config storage analysis ===');
  console.log(`Total devices:              ${total}`);
  console.log(`Devices with config:        ${withConfig}`);
  console.log(`Devices with sched profiles:${withProfiles}`);
  if (s.devices) {
    console.log(`\nDevices with profiles:     ${s.devices}`);
    console.log(`Avg config size:           ${(s.avgCfgBytes / 1024).toFixed(1)} KB`);
    console.log(`Avg schedule payload size: ${(s.avgSchedBytes / 1024).toFixed(1)} KB (${((s.avgSchedBytes / s.avgCfgBytes) * 100).toFixed(0)}% of config)`);
    console.log(`Max config size:           ${(s.maxCfgBytes / 1024).toFixed(1)} KB`);
    console.log(`Avg profiles per device:   ${s.avgProfiles.toFixed(1)}`);
    const projectedMB = (s.avgCfgBytes * withProfiles) / (1024 * 1024);
    console.log(`Projected schedule storage: ${projectedMB.toFixed(1)} MB across ${withProfiles} devices`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
