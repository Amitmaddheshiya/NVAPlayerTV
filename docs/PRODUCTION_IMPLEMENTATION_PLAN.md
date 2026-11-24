# Production Implementation Plan

Remaining work to reach production. Fixes-first track (Option A) is complete —
see `PRODUCTION_PROGRESS.md` for the 30 implemented items. This plan covers what
is left, in execution order.

## Step 0 — Pre-deploy code gates (before any AWS work)

| # | Task | Owner | Gate |
|---|---|---|---|
| 0.1 | Rebuild APK with pending changes (#15 throttle, #18 dead-code removal) | APK | New APK version distributed to devices |
| 0.2 | Rerun load test on compiled backend: `npm run build && npm start`, then `npm run load-test -- --seed 500 --devices 500 --concurrency 100 --duration 60 --phase both` | Backend | Numbers recorded in `LOAD_TEST_REPORT.md` |
| 0.3 | Run backend tests once more: `npm test` (27 tests) | Backend | All PASS |
| 0.4 | Run APK tests: `npx jest` | APK | All PASS |
| 0.5 | `tsc` clean on `cloud-backend` and `cloud-frontend` | Both | No errors |

## Step 1 — Single-node production deploy (fastest safe path)

Goal: get live on AWS with ONE backend instance. Socket.io stays single-node —
this is safe because there is only one node.

1. Provision EC2 (or ECS service with desired count = 1) + ALB + ACM cert + Route53.
2. MongoDB Atlas cluster (replica set, PITR backups) — see `DATABASE_MIGRATION_GUIDE.md`.
3. ElastiCache Redis (or single Redis on the same host for MVP) — required for caches.
4. Deploy backend: `npm ci && npm run build && pm2 start ecosystem.config.js` —
   **override `instances` to `1`** (edit ecosystem or use `pm2 start --instances 1`).
5. Deploy CMS: `npm ci && npm run build` → serve `dist/` via nginx.
6. Nginx: fix upstream to single `127.0.0.1:3000`, **remove `/uploads/` location**,
   enable HTTPS server block, keep `client_max_body_size 100m`.
7. Set all env vars per `ENVIRONMENT_VARIABLES.md` (JWT_SECRET from Secrets Manager).
8. Smoke test: health endpoint, CMS login, device activation, one media upload
   (chunked >32MB to exercise fileHash path), one device heartbeat, one config push.

## Step 2 — Media storage migration (S3 + CloudFront)

Required before horizontal scaling. Phase 1 item 1.

1. Create private S3 bucket + CloudFront distribution (OAC) + signed URLs/cookies.
2. Implement/verify `STORAGE_TYPE=s3` path in backend storage layer.
3. Migrate existing `uploads/` objects to S3 (script + DB `Media.path`/`url` update).
4. Point CMS + APK media URLs at CloudFront domain.
5. Verify: upload, ranged playback (206), delete, chunked resume.

## Step 3 — Horizontal scaling (only after Step 2)

1. `@socket.io/redis-adapter` + sticky sessions on ALB — see `SOCKET_SCALING.md`.
2. PM2 cluster or ECS desired count > 1.
3. Re-run load test at target concurrency; record in `LOAD_TEST_REPORT.md`.
4. Enable ASG with health checks (`/health`).

## Step 4 — Hardening & ops

1. WAF on ALB/CloudFront, security groups least-privilege, IAM roles (no static AWS keys).
2. CloudWatch alarms: CPU, memory, 5xx rate, heartbeat volume drop, disk usage.
3. Backup/restore drill per `ROLLBACK_AND_DISASTER_RECOVERY.md`.
4. Runbook handover per `PRODUCTION_OPERATIONS_RUNBOOK.md`.

## Explicitly deferred (documented, not blocking)

- MQTT/AWS IoT evaluation (Socket.io optimized first).
- ECS migration (EC2 + PM2 is fine at this scale).
- MongoDB sharding (replica set sufficient for 40k devices).
- Picker-page pagination beyond limit=1000.
- `Device.config` schedule-profile storage refactor (only if schedules scale).

## Rollback strategy

Every step is independently reversible — see `ROLLBACK_AND_DISASTER_RECOVERY.md`.
DB changes so far are additive (indexes, TTL) and need no rollback; the only
data-mutating script (`backfill-assigned-devices.js`) is add-only.
