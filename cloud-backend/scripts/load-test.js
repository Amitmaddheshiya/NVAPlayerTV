/**
 * Load-test harness for the cloud backend.
 *
 * Simulates N activated TV devices against a RUNNING backend:
 *   - heartbeat phase: POST /api/devices/:id/heartbeat (steady-state, config
 *     version already synced so no config payload is returned)
 *   - media phase:     GET /api/media/file/<path> with Range header + device
 *     token in query (same path the Android video component uses)
 *
 * Usage:
 *   node scripts/load-test.js --seed 500                 # create 500 fake devices + 1 media file
 *   node scripts/load-test.js --devices 500 --concurrency 50 --duration 30
 *   node scripts/load-test.js --phase media --devices 500 --concurrency 50 --duration 30
 *   node scripts/load-test.js --cleanup                  # remove all load-test data
 *
 * Options:
 *   --base-url URL       default http://localhost:3000
 *   --devices N          how many seeded devices to use (default: all lt-* devices)
 *   --concurrency N      parallel workers (default 50)
 *   --duration S         seconds per phase (default 30)
 *   --phase NAME         heartbeat | media | both (default both)
 *   --range-start N      range GET start byte (default 0)
 *   --range-end N        range GET end byte (default 1048575 = 1MB)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const PREFIX = 'lt-dev-';
// Media.path is relative to the uploads/ root (real docs look like
// 'users/<id>/general/<file>') — no 'uploads/' prefix, or express.static
// would look for uploads/uploads/<file>.
const MEDIA_PATH = 'lt-media.bin';
const MEDIA_SIZE_BYTES = 8 * 1024 * 1024; // 8MB dummy file
const CONFIG_VERSION = 1;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);
const BASE_URL = String(args['base-url'] || 'http://localhost:3000').replace(/\/$/, '');
const CONCURRENCY = Number(args.concurrency || 50);
const DURATION_S = Number(args.duration || 30);
const PHASE = String(args.phase || 'both');
const RANGE_START = Number(args['range-start'] || 0);
const RANGE_END = Number(args['range-end'] || 1048575);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

const latency = { heartbeat: [], media: [] };
const statusCounts = { heartbeat: {}, media: {} };

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function timedFetch(url, options, bucket) {
  const start = performance.now();
  try {
    const res = await fetch(url, options);
    // Drain body so keep-alive reuse works and we measure full response time.
    await res.arrayBuffer();
    latency[bucket].push(performance.now() - start);
    statusCounts[bucket][res.status] = (statusCounts[bucket][res.status] || 0) + 1;
  } catch (err) {
    latency[bucket].push(performance.now() - start);
    statusCounts[bucket].error = (statusCounts[bucket].error || 0) + 1;
  }
}

async function runPhase(phase, devices, tokens, mediaUrl) {
  const endAt = Date.now() + DURATION_S * 1000;
  let cursor = 0;
  const worker = async () => {
    while (Date.now() < endAt) {
      const i = cursor++ % devices.length;
      const deviceId = devices[i];
      if (phase === 'heartbeat') {
        await timedFetch(`${BASE_URL}/api/devices/${deviceId}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[i]}` },
          body: JSON.stringify({
            status: 'online',
            appVersion: 'loadtest',
            configVersion: CONFIG_VERSION,
            storage: { total: 16000000000, used: 4000000000, free: 12000000000 },
          }),
        }, 'heartbeat');
      } else {
        await timedFetch(`${mediaUrl}?deviceToken=${encodeURIComponent(tokens[i])}&deviceId=${encodeURIComponent(deviceId)}`, {
          headers: { Range: `bytes=${RANGE_START}-${RANGE_END}` },
        }, 'media');
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

function report(phase) {
  const lats = latency[phase].sort((a, b) => a - b);
  const total = lats.length;
  const errors = Object.entries(statusCounts[phase])
    .filter(([code]) => code === 'error' || Number(code) >= 500)
    .reduce((sum, [, n]) => sum + n, 0);
  const rps = total / DURATION_S;
  console.log(`\n=== ${phase.toUpperCase()} phase (${DURATION_S}s, ${CONCURRENCY} workers) ===`);
  console.log(`Requests:      ${total}  (${rps.toFixed(1)} req/s)`);
  console.log(`Errors/5xx:    ${errors}  (${total ? ((errors / total) * 100).toFixed(2) : 0}%)`);
  console.log(`Latency ms:    p50=${percentile(lats, 50).toFixed(1)}  p95=${percentile(lats, 95).toFixed(1)}  p99=${percentile(lats, 99).toFixed(1)}  max=${(lats[lats.length - 1] || 0).toFixed(1)}`);
  console.log(`Status codes:  ${JSON.stringify(statusCounts[phase])}`);
}

async function seed(count) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // Real file so express.static serves actual bytes (range requests included).
  const uploadsDir = path.join(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, 'lt-media.bin');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== MEDIA_SIZE_BYTES) {
    fs.writeFileSync(filePath, Buffer.alloc(MEDIA_SIZE_BYTES, 0x61));
  }

  const serverUrl = process.env.SERVER_URL || BASE_URL;
  const mediaUrl = `${serverUrl}/api/media/file/${MEDIA_PATH}`;
  const config = {
    layout: 'fullscreen',
    sections: [{ contentType: 'multimedia', mediaUrls: [mediaUrl] }],
    mediaUrls: [mediaUrl],
  };

  await db.collection('media').updateOne(
    { path: MEDIA_PATH },
    {
      $set: {
        filename: 'lt-media.bin', originalName: 'lt-media.bin', mimeType: 'application/octet-stream',
        size: MEDIA_SIZE_BYTES, url: mediaUrl, path: MEDIA_PATH, section: 1,
        storageType: 'local',
      },
    },
    { upsert: true }
  );

  const ops = [];
  for (let i = 1; i <= count; i++) {
    const deviceId = `${PREFIX}${String(i).padStart(5, '0')}`;
    ops.push({
      updateOne: {
        filter: { deviceId },
        update: {
          $set: {
            deviceId, name: `Load Test ${i}`, activated: true, status: 'offline',
            config, 'cacheInfo.configVersion': CONFIG_VERSION,
          },
        },
        upsert: true,
      },
    });
  }
  for (let i = 0; i < ops.length; i += 1000) {
    await db.collection('devices').bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }
  console.log(`Seeded ${count} devices (${PREFIX}*) + media file ${MEDIA_PATH} (${MEDIA_SIZE_BYTES} bytes)`);
  await mongoose.disconnect();
}

async function cleanup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const devRes = await db.collection('devices').deleteMany({ deviceId: { $regex: `^${PREFIX}` } });
  const mediaRes = await db.collection('media').deleteMany({ path: { $in: [MEDIA_PATH, `uploads/${MEDIA_PATH}`] } });
  const filePath = path.join(process.cwd(), 'uploads', MEDIA_PATH);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  console.log(`Cleanup: ${devRes.deletedCount} devices, ${mediaRes.deletedCount} media docs, file removed`);
  await mongoose.disconnect();
}

async function loadDevices() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const filter = args.devices ? { deviceId: { $regex: `^${PREFIX}`, $exists: true } } : { deviceId: { $regex: `^${PREFIX}` } };
  let devices = await db.collection('devices').find(filter).project({ deviceId: 1 }).limit(args.devices ? Number(args.devices) : 0).toArray();
  if (!devices.length) {
    await mongoose.disconnect();
    throw new Error(`No ${PREFIX}* devices found — run with --seed N first`);
  }
  const ids = devices.map((d) => d.deviceId);
  const tokens = ids.map((id) => jwt.sign({ role: 'device', deviceId: id }, JWT_SECRET, { expiresIn: '1h' }));
  const serverUrl = process.env.SERVER_URL || BASE_URL;
  const mediaUrl = `${serverUrl}/api/media/file/${MEDIA_PATH}`;
  await mongoose.disconnect();
  return { ids, tokens, mediaUrl };
}

(async () => {
  try {
    if (args.seed) { await seed(Number(args.seed)); return; }
    if (args.cleanup) { await cleanup(); return; }

    const { ids, tokens, mediaUrl } = await loadDevices();
    console.log(`Load test: ${ids.length} devices, ${CONCURRENCY} workers, ${DURATION_S}s, base=${BASE_URL}, phase=${PHASE}`);

    if (PHASE === 'heartbeat' || PHASE === 'both') await runPhase('heartbeat', ids, tokens, mediaUrl);
    if (PHASE === 'media' || PHASE === 'both') await runPhase('media', ids, tokens, mediaUrl);

    if (PHASE === 'heartbeat' || PHASE === 'both') report('heartbeat');
    if (PHASE === 'media' || PHASE === 'both') report('media');
    process.exit(0);
  } catch (err) {
    console.error('load-test failed:', err);
    process.exit(1);
  }
})();
