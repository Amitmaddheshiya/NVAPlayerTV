/**
 * Backfill Media.assignedDevices from Device.config.
 *
 * Historical configs only synced assignedDevices for multimedia section
 * mediaUrls — legacy top-level mediaUrls and schedule-profile media were
 * missed. This script recomputes the full URL set per device (same rules as
 * getConfiguredMediaUrls in src/utils/configMedia.ts) and $addToSet's the
 * deviceId onto matching Media docs. ADD-ONLY: it never removes assignments,
 * so manual assignMedia entries are preserved. Removals happen naturally on
 * the next config save.
 *
 * Run: node scripts/backfill-assigned-devices.js [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');

// Mirrors getConfiguredMediaUrls in src/utils/configMedia.ts.
function getConfiguredMediaUrls(config) {
  const urls = new Set();
  const add = (url) => {
    const v = String(url || '').trim();
    if (v) urls.add(v);
  };
  const collect = (cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (Array.isArray(cfg.mediaUrls)) cfg.mediaUrls.forEach(add);
    for (const section of Array.isArray(cfg.sections) ? cfg.sections : []) {
      if (section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls)) {
        section.mediaUrls.forEach(add);
      }
    }
    for (const profile of Array.isArray(cfg.schedule?.profiles) ? cfg.schedule.profiles : []) {
      collect(profile?.config);
    }
  };
  collect(config);
  return urls;
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const devices = db.collection('devices');
  const media = db.collection('media');

  let scanned = 0;
  let devicesWithMedia = 0;
  let mediaUpdated = 0;
  let urlsSeen = new Set();

  const cursor = devices.find({ config: { $exists: true, $ne: null } }).project({ deviceId: 1, config: 1 });
  for await (const device of cursor) {
    scanned++;
    const urls = getConfiguredMediaUrls(device.config);
    if (!urls.size) continue;
    devicesWithMedia++;
    urls.forEach((u) => urlsSeen.add(u));

    const docs = await media.find({ url: { $in: [...urls] } }).project({ _id: 1, assignedDevices: 1 }).toArray();
    const ops = [];
    for (const doc of docs) {
      const assigned = Array.isArray(doc.assignedDevices) ? doc.assignedDevices : [];
      if (!assigned.includes(device.deviceId)) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $addToSet: { assignedDevices: device.deviceId } },
          },
        });
      }
    }
    if (ops.length) {
      mediaUpdated += ops.length;
      if (!DRY_RUN) {
        await media.bulkWrite(ops, { ordered: false });
      }
    }
    if (scanned % 5000 === 0) {
      console.log(`  ...scanned ${scanned} devices, ${mediaUpdated} media assignments pending`);
    }
  }

  console.log('\n=== Backfill complete ===');
  console.log(`Devices scanned:        ${scanned}`);
  console.log(`Devices with media:     ${devicesWithMedia}`);
  console.log(`Unique media URLs seen: ${urlsSeen.size}`);
  console.log(`Media docs to update:   ${mediaUpdated}${DRY_RUN ? ' (dry-run, nothing written)' : ''}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('backfill-assigned-devices failed:', err);
  process.exit(1);
});
