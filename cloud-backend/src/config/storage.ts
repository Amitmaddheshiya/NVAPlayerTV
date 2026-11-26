import env from './env';
import { S3Client, DeleteObjectCommand, CopyObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import fs from 'fs';

export interface StorageService {
  upload(file: Express.Multer.File, path: string): Promise<string>;
  delete(path: string): Promise<void>;
  move?(fromPath: string, toPath: string): Promise<void>;
  getUrl(path: string): string;
  /** Short-lived URL the client can fetch bytes from directly (S3 presign or CloudFront signed). */
  getDeliveryUrl?(path: string, expiresInSeconds?: number): Promise<string>;
}

export class LocalStorage implements StorageService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = env.UPLOAD_DIR;
  }

  async upload(file: Express.Multer.File, path: string): Promise<string> {
    const fs = require('fs').promises;
    const filePath = `${this.uploadDir}/${path}`;

    // Ensure directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await fs.mkdir(dir, { recursive: true });

    // Move file from temp to destination
    await fs.rename(file.path, filePath);

    return filePath;
  }

  async delete(path: string): Promise<void> {
    const fs = require('fs').promises;
    const filePath = `${this.uploadDir}/${path}`;

    try {
      await fs.unlink(filePath);
      // Try to remove empty parent directories (cleanup)
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      try {
        await fs.rmdir(dir);
      } catch (e) {
        // Directory not empty, ignore
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    const fsp = fs.promises;
    const fullFrom = `${this.uploadDir}/${fromPath}`;
    const fullTo = `${this.uploadDir}/${toPath}`;
    const dir = fullTo.substring(0, fullTo.lastIndexOf('/'));
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(fullFrom, fullTo);
  }

  getUrl(path: string): string {
    return `${env.SERVER_URL}/api/media/file/${path}`;
  }

  // Helper to get user-based path
  getUserPath(userId: string, folder?: string, filename?: string): string {
    const folderPath = folder ? `users/${userId}/${folder}` : `users/${userId}/general`;
    return filename ? `${folderPath}/${filename}` : folderPath;
  }
}

/**
 * CloudFront canned-policy signed URL (RSA-SHA1, base64-encoded policy).
 * Used when CDN_BASE_URL + key pair are configured so edge locations can
 * serve bytes without hitting the origin for auth on every range request.
 */
function buildCloudFrontSignedUrl(resourceUrl: string, keyPairId: string, privateKeyPem: string, expiresEpochSeconds: number): string {
  const policy = JSON.stringify({
    Statement: [{
      Resource: resourceUrl,
      Condition: { DateLessThan: { 'AWS:EpochTime': expiresEpochSeconds } },
    }],
  });
  const signer = crypto.createSign('RSA-SHA1');
  signer.update(policy);
  const signature = signer.sign(privateKeyPem, 'base64');
  const encodedPolicy = Buffer.from(policy).toString('base64');
  const separator = resourceUrl.includes('?') ? '&' : '?';
  return `${resourceUrl}${separator}Policy=${encodeURIComponent(encodedPolicy)}&Signature=${encodeURIComponent(signature)}&Key-Pair-Id=${encodeURIComponent(keyPairId)}`;
}

export class S3Storage implements StorageService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    if (!env.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME is required when STORAGE_TYPE=s3');
    }
    this.bucket = env.S3_BUCKET_NAME;
    this.s3 = new S3Client({
      region: env.AWS_REGION || 'ap-south-1',
      credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
        : undefined, // fall back to the default provider chain (IAM role etc.)
    });
  }

  async upload(file: Express.Multer.File, path: string): Promise<string> {
    const fsp = fs.promises;
    // lib-storage Upload auto-switches to multipart for large bodies, so
    // multi-GB media streams from disk and never sits in memory.
    await new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: path,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype || 'application/octet-stream',
      },
    }).done();
    // S3 has the bytes now — remove the local temp copy so disk doesn't fill.
    await fsp.unlink(file.path).catch(() => undefined);
    return path;
  }

  async delete(path: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: path }));
    } catch (error) {
      console.error(`Error deleting S3 object ${path}:`, error);
    }
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    await this.s3.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${fromPath}`,
      Key: toPath,
    }));
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: fromPath }));
  }

  getUrl(path: string): string {
    // URLs stay on the backend endpoint — fileAccessAuth still gates access,
    // then serveMediaFile redirects to a short-lived signed delivery URL.
    // Keeping this format means zero DB/config/APK migration.
    return `${env.SERVER_URL}/api/media/file/${path}`;
  }

  async getDeliveryUrl(path: string, expiresInSeconds?: number): Promise<string> {
    const ttl = expiresInSeconds || env.MEDIA_URL_EXPIRES_IN || 3600;

    // Preferred: CloudFront signed URL — bytes come from the edge, not EC2.
    if (env.CDN_BASE_URL && env.CLOUDFRONT_KEY_PAIR_ID && env.CLOUDFRONT_PRIVATE_KEY) {
      const resourceUrl = `${env.CDN_BASE_URL}/${path}`;
      const expires = Math.floor(Date.now() / 1000) + ttl;
      return buildCloudFrontSignedUrl(resourceUrl, env.CLOUDFRONT_KEY_PAIR_ID, env.CLOUDFRONT_PRIVATE_KEY, expires);
    }

    // Fallback: S3 presigned GET — still offloads bytes from EC2 to S3,
    // just without edge caching. Range requests are supported natively.
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: path }), { expiresIn: ttl });
  }
}

const localStorage = new LocalStorage();
let cachedS3: S3Storage | null = null;

/**
 * Returns the storage backend. Pass an explicit type ('local' | 's3') to
 * address a specific media record — needed during migration when old files
 * live on disk and new files live in S3 under the same deployment.
 */
export function getStorageService(type?: string): StorageService {
  const effective = type === 's3' || type === 'local' ? type : env.STORAGE_TYPE;
  if (effective === 's3') {
    if (!cachedS3) cachedS3 = new S3Storage();
    return cachedS3;
  }
  return localStorage;
}
