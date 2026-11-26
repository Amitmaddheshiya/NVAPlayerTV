/**
 * MongoDB backup: mongodump -> gzip -> S3, with retention cleanup.
 *
 * MongoDB Atlas M0 (free tier) has NO automated backups — run this daily via
 * cron on the EC2 host (see docs/PRODUCTION_OPERATIONS_RUNBOOK.md).
 *
 * Prerequisites on the host:
 *   - mongodb-database-tools installed (`mongodump` on PATH)
 *     Amazon Linux 2023: sudo dnf install -y mongodb-database-tools
 *   - AWS creds with s3:PutObject/GetObject/DeleteObject on the backup prefix
 *
 * Env (reuse the backend .env):
 *   MONGODB_URI            required
 *   S3_BUCKET_NAME         required (same bucket as media is fine)
 *   AWS_REGION             required
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 *   BACKUP_PREFIX          optional, default 'db-backups/'
 *   BACKUP_RETENTION_DAYS  optional, default 14
 *
 * Usage:  node scripts/backup-mongo.js
 * Cron:   0 3 * * * cd /path/to/cloud-backend && /usr/bin/node scripts/backup-mongo.js >> /var/log/mongo-backup.log 2>&1
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const execFileAsync = promisify(execFile);

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const BUCKET = process.env.S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'ap-south-1';
const PREFIX = (process.env.BACKUP_PREFIX || 'db-backups/').replace(/^\/+|\/+$/g, '') + '/';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);

function fail(msg) {
  console.error(`[backup] ${msg}`);
  process.exit(1);
}

async function main() {
  if (!MONGODB_URI) fail('MONGODB_URI is not set');
  if (!BUCKET) fail('S3_BUCKET_NAME is not set (backups need a bucket)');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mongo-backup-'));
  const dumpDir = path.join(workDir, 'dump');
  const archiveName = `nva-db-${stamp}.gz`;
  const archivePath = path.join(workDir, archiveName);

  try {
    console.log(`[backup] dumping MongoDB -> ${dumpDir}`);
    await execFileAsync('mongodump', [
      '--uri', MONGODB_URI,
      '--gzip',
      '--out', dumpDir,
    ], { maxBuffer: 64 * 1024 * 1024 });

    // mongodump --gzip writes .bson.gz files inside dumpDir/<db>/ — tar them
    // into a single archive for one S3 object per backup.
    console.log('[backup] archiving dump');
    await execFileAsync('tar', ['-czf', archivePath, '-C', dumpDir, '.'], { maxBuffer: 64 * 1024 * 1024 });

    const sizeMb = (fs.statSync(archivePath).size / (1024 * 1024)).toFixed(1);
    console.log(`[backup] archive ready: ${archiveName} (${sizeMb} MB)`);

    const s3 = new S3Client({
      region: REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
        : undefined,
    });

    const key = `${PREFIX}${archiveName}`;
    console.log(`[backup] uploading s3://${BUCKET}/${key}`);
    await new Upload({
      client: s3,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: fs.createReadStream(archivePath),
        ContentType: 'application/gzip',
        ServerSideEncryption: 'AES256',
      },
    }).done();
    console.log('[backup] upload complete');

    // Retention: delete backup objects older than RETENTION_DAYS.
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let deleted = 0;
    let token;
    do {
      const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token }));
      for (const obj of listed.Contents || []) {
        if (obj.LastModified && obj.LastModified.getTime() < cutoff) {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
          deleted++;
        }
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
    if (deleted) console.log(`[backup] retention cleanup: deleted ${deleted} old backup(s)`);

    console.log('[backup] done');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[backup] failed:', error.message || error);
  process.exit(1);
});
