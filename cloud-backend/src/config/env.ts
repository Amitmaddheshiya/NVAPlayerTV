import dotenv from 'dotenv';

dotenv.config();

interface Env {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
  STORAGE_TYPE: 'local' | 's3';
  UPLOAD_DIR: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  S3_BUCKET_NAME?: string;
  CDN_BASE_URL?: string;
  CLOUDFRONT_KEY_PAIR_ID?: string;
  CLOUDFRONT_PRIVATE_KEY?: string;
  MEDIA_URL_EXPIRES_IN: number;
  FRONTEND_URL: string;
  SERVER_URL: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
}

const env: Env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key',
  STORAGE_TYPE: (process.env.STORAGE_TYPE as 'local' | 's3') || 'local',
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  CDN_BASE_URL: (process.env.CDN_BASE_URL || '').replace(/\/+$/, ''),
  CLOUDFRONT_KEY_PAIR_ID: process.env.CLOUDFRONT_KEY_PAIR_ID,
  CLOUDFRONT_PRIVATE_KEY: process.env.CLOUDFRONT_PRIVATE_KEY,
  MEDIA_URL_EXPIRES_IN: parseInt(process.env.MEDIA_URL_EXPIRES_IN || '3600', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes default
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per window
};

if (!env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}

if (env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production');
}

export default env;
