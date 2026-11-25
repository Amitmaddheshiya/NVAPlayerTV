# Environment Variables

All variables the cloud backend reads (`cloud-backend/src/config/env.ts` +
`src/config/redis.ts` + `src/config/testAdmin.ts`). Set via `.env` locally or
AWS Secrets Manager / Parameter Store in production. **Never commit `.env`.**

## Required

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string (Atlas `mongodb+srv://...`) | `mongodb+srv://user:pass@cluster.mongodb.net/signage` |
| `JWT_SECRET` | JWT signing secret. **Required in production** — app refuses to start without it when `NODE_ENV=production`. Use ≥32 random bytes. | `openssl rand -hex 32` |

## Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | `production` enables JWT_SECRET check + rate limiting |
| `FRONTEND_URL` | `http://localhost:5173` | Added to CORS allowlist (in addition to built-in dev origins) |
| `SERVER_URL` | `http://localhost:3000` | Public backend URL (used in generated links) |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Rate-limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window per IP |

## Storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_TYPE` | `local` | `local` = `UPLOAD_DIR` on disk; `s3` = S3 bucket |
| `UPLOAD_DIR` | `./uploads` | Local upload root (chunked sessions under `uploads/temp/chunked/`) |
| `AWS_ACCESS_KEY_ID` | — | Only for `STORAGE_TYPE=s3` (prefer IAM role instead) |
| `AWS_SECRET_ACCESS_KEY` | — | Only for `STORAGE_TYPE=s3` |
| `AWS_REGION` | — | e.g. `ap-south-1` |
| `S3_BUCKET_NAME` | — | Private media bucket |
| `CDN_BASE_URL` | — | CloudFront distribution domain (e.g. `https://d111.cloudfront.net`). When set with the key pair below, S3 media redirects to edge-signed URLs instead of S3 presigns. |
| `CLOUDFRONT_KEY_PAIR_ID` | — | CloudFront public key ID from the trusted key group |
| `CLOUDFRONT_PRIVATE_KEY` | — | RSA private key PEM (matching the CloudFront public key). Keep in Secrets Manager — never commit. |
| `MEDIA_URL_EXPIRES_IN` | `3600` | Seconds a signed delivery URL stays valid. Each range request gets a fresh redirect, so this only bounds a single transfer. |

## Redis (optional but recommended)

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis/ElastiCache endpoint. App degrades gracefully without it (caches disabled). |

## Test admin (development only — do NOT set in production)

| Variable | Description |
|---|---|
| `TEST_ADMIN_EMAIL` | Email for auto-provisioned admin (`src/config/testAdmin.ts`) |
| `TEST_ADMIN_PASSWORD` | Password for that admin |

## CMS frontend (`cloud-frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api` | Backend API base URL baked into the build |

## APK (`src/services/cloudRuntimeConfig.ts`)

| Constant | Description |
|---|---|
| `DEFAULT_TEST_CLOUD_API_URL` | Fallback cloud API URL when none configured on device |

## Production checklist

- [ ] `JWT_SECRET` set to a strong random value (not `dev-secret-key`)
- [ ] `NODE_ENV=production`
- [ ] `MONGODB_URI` points to Atlas prod cluster
- [ ] `REDIS_URL` points to ElastiCache/Redis
- [ ] `FRONTEND_URL` = real CMS domain (e.g. `https://cms.example.com`)
- [ ] `SERVER_URL` = real API domain
- [ ] `STORAGE_TYPE`/`S3_*` set only when S3 migration is done
- [ ] `TEST_ADMIN_*` **unset**
- [ ] No `.env` file committed; secrets in Secrets Manager
