/**
 * Rewrite stale media URL origins to the current SERVER_URL.
 *
 * Media.url, Device.config, Group.config and ScheduleTemplate configs store
 * ABSOLUTE media URLs (e.g. http://192.168.1.4:3000/api/media/file/...). When
 * the server IP/host changes, those stored URLs go stale and both the CMS
 * preview and the TV APK fail with connection timeouts.
 *
 * This script rewrites ONLY the origin of URLs whose path starts with
 * /api/media/file/ — paths, query strings and non-media URLs are untouched.
 * Safe to re-run (idempotent).
 *
 * Usage:  node scripts/fix-media-url-hosts.js [--dry-run]
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SERVER_URL = (process.env.SERVER_URL || 'http://localhost:3000').replace(/\/+$/, '');
const MEDIA_PATH_PREFIX = '/api/media/file/';
const DRY_RUN = process.argv.includes('--dry-run');

// Matches the origin (scheme://host[:port]) of any absolute URL whose path
// starts with /api/media/file/. Lookahead keeps the path (incl. spaces,
// parentheses, query strings) untouched.
const MEDIA_URL_ORIGIN_RE = /https?:\/\/[^\/\s"'\\]+(?=\/api\/media\/file\/)/g;

function rewriteString(value) {
  if (typeof value !== 'string' || !value.includes('/api/media/file/')) return { value, changed: false };
  let changed = false;
  const next = value.replace(MEDIA_URL_ORIGIN_RE, (origin) => {
    if (origin === SERVER_URL) return origin;
    changed = true;
    return SERVER_URL;
  });
  return { value: next, changed };
}

function rewriteDeep(node, stats) {
  if (typeof node === 'string') {
    const r = rewriteString(node);
    if (r.changed) stats.strings += 1;
    return r.value;
  }
  if (Array.isArray(node)) {
    return node.map((item) => rewriteDeep(item, stats));
  }
  if (node && typeof node === 'object') {
    // Handle ObjectId / Date / Buffer without recursing into them.
    if (node._bsontype || node instanceof Date || Buffer.isBuffer(node)) return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = rewriteDeep(v, stats);
    return out;
  }
  return node;
}

async function fixCollection(db, name, fields) {
  const coll = db.collection(name);
  const docs = await coll.find({}, { projection: fields }).toArray();
  let touched = 0;
  for (const doc of docs) {
    const stats = { strings: 0 };
    const updated = {};
    let docChanged = false;
    for (const field of fields) {
      if (doc[field] === undefined) continue;
      const next = rewriteDeep(doc[field], stats);
      if (stats.strings > 0) {
        updated[field] = next;
        docChanged = true;
      }
    }
    if (docChanged) {
      touched += 1;
      if (!DRY_RUN) {
        await coll.updateOne({ _id: doc._id }, { $set: updated });
      }
      console.log(`  ${name}/${doc._id}: rewrote ${stats.strings} URL string(s) in [${Object.keys(updated).join(', ')}]`);
    }
  }
  console.log(`${name}: ${touched}/${docs.length} doc(s) ${DRY_RUN ? 'would be ' : ''}updated`);
  return touched;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`SERVER_URL = ${SERVER_URL}  (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);

  await fixCollection(db, 'media', ['url']);
  await fixCollection(db, 'devices', ['config']);
  await fixCollection(db, 'groups', ['config']);
  await fixCollection(db, 'scheduletemplates', ['config']);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
