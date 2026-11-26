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
| `CORS_ORIGINS` | — | Comma-separated extra CORS origins (e.g. `https://cms.example.com,https://admin.example.com`) |
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

## Redis (optional)

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis/ElastiCache endpoint. **Optional** — the app runs fully on an in-memory cache layer when Redis is absent or down (circuit breaker prevents reconnect storms). Set it only for multi-instance deployments where cache must be shared. |

## Test admin (development only — do NOT set in production)

| Variable | Description |
|---|---|
| `DEV_ADMIN_PASSWORD` | Password for the auto-provisioned dev admin (`src/config/testAdmin.ts`, email `nextviewsignage@gmail.com`). If unset, bootstrap is skipped with a warning. Never set in production — `ensureTestAdmin` returns early when `NODE_ENV=production`. |

## DB backup (`scripts/backup-mongo.js`, run via cron — not the server)

| Variable | Default | Description |
|---|---|---|
| `BACKUP_PREFIX` | `db-backups/` | S3 key prefix for backup archives |
| `BACKUP_RETENTION_DAYS` | `14` | Delete backup objects older than this many days |

Requires `mongodump` on PATH (`mongodb-database-tools`) and the same
`MONGODB_URI`/`S3_BUCKET_NAME`/`AWS_*` vars as the backend.

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
- [ ] `REDIS_URL` — only needed for multi-instance; single EC2 can skip (in-memory cache)
- [ ] `FRONTEND_URL` = real CMS domain (e.g. `https://cms.example.com`)
- [ ] `CORS_ORIGINS` set if the CMS is served from additional domains
- [ ] `SERVER_URL` = real API domain
- [ ] `STORAGE_TYPE`/`S3_*` set only when S3 migration is done
- [ ] `DEV_ADMIN_PASSWORD` **unset** (and `NODE_ENV=production` so bootstrap is skipped anyway)
- [ ] Daily `npm run backup:db` cron configured (Atlas M0 has no backups)
- [ ] No `.env` file committed; secrets in Secrets Manager
