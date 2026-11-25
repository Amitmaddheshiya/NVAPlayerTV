# AWS Deployment Guide

## ✅ LOCKED production setup (decided 2026-11-25)

Target: **~$15–20/mo** for 20 users / 40 devices. Single instance, no code
changes needed — env vars + AWS console only.

```
Route53 → EC2 t3.small (Elastic IP)
            ├── Caddy/nginx :443 → free Let's Encrypt SSL (auto-renew)
            │     ├── api.domain.com  → backend :3000 (PM2, 1 instance)
            │     └── cms.domain.com  → cloud-frontend/dist static
            ├── /socket.io → same process (websocket, single-node OK)
            └── /api/media/file/* → fileAccessAuth → 302 → signed URL
MongoDB Atlas M0 (free, 512MB)   → MONGODB_URI
S3 (private) + CloudFront (OAC, signed URLs) → media bytes
Redis / ALB / NAT / Secrets Manager / WAF → SKIP for now
```

**Estimated monthly:** EC2 t3.small ~$15 + EBS gp3 30GB ~$2.5 + S3 ~$2 +
CloudFront ~$0 (1TB free first 12mo) then ~$5–10 + Route53 ~$1 +
CloudWatch ~$1 + 18% GST ≈ **$18–25/mo**.

### Deploy checklist (step-by-step)

1. **MongoDB Atlas** — create M0 free cluster → Database Access (user/pass)
   → Network Access: allow EC2 Elastic IP (or 0.0.0.0/0 temporarily).
   Copy connection string → `MONGODB_URI`. Set up weekly `mongodump` cron
   on EC2 (M0 backups are limited).
2. **S3 + CloudFront** — follow "Phase B" steps below (bucket → OAC →
   signed URLs → key pair → env vars).
3. **EC2 t3.small** — Amazon Linux 2023 or Ubuntu, Node 20:
   - `git clone` / upload code → `cloud-backend`: `npm ci && npm run build`
   - `cloud-frontend`: `npm ci && npm run build` → serve `dist/` via Caddy
   - `.env` in `cloud-backend/` (see `ENVIRONMENT_VARIABLES.md`):
     `NODE_ENV=production`, `PORT=3000`, `MONGODB_URI`, `JWT_SECRET`
     (`openssl rand -hex 32`), `SERVER_URL=https://api.<domain>`,
     `FRONTEND_URL=https://cms.<domain>`, `STORAGE_TYPE=s3`,
     `S3_BUCKET_NAME`, `AWS_REGION=ap-south-1`, `CDN_BASE_URL`,
     `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`,
     `MEDIA_URL_EXPIRES_IN=3600`. **No `REDIS_URL`** (optional).
   - IAM instance role: `s3:GetObject/PutObject/DeleteObject` on media
     bucket only — no static AWS keys.
   - PM2: `pm2 start ecosystem.config.js --instances 1 && pm2 save &&
     pm2 startup` — **single instance only** (socket.io is single-node).
   - Elastic IP → associate (stable IP for Atlas allowlist + DNS).
4. **Caddy** (recommended, zero-config SSL):
   ```
   api.<domain> { reverse_proxy 127.0.0.1:3000 }
   cms.<domain> { root * /path/to/cloud-frontend/dist; file_server; try_files {path} /index.html }
   ```
   Or nginx + certbot — same result.
5. **Route53** — A records `api` + `cms` → Elastic IP.
6. **Smoke test** — `/health`, CMS login, device activation, chunked
   upload >32MB, heartbeat, config push, media playback (302 → signed URL
   → 206 range).

### Scaling path (when load grows — in order)

| Trigger | Action | Cost |
|---|---|---|
| DB >400MB or slow queries | Atlas M0 → M10 | $0 → ~$60 |
| EC2 CPU/mem >70% | t3.small → t3.medium (or t4g Graviton ~20% cheaper) | ~$15 → ~$30 |
| >200–500 devices / need HA | ALB + 2nd EC2 + `@socket.io/redis-adapter` + ElastiCache (see `SOCKET_SCALING.md`, Phase C) | ~$150–200 |
| Steady load confirmed | EC2 1yr Reserved Instance / Savings Plan | −40% on EC2 |
| Media bandwidth heavy | Already on CloudFront — cost ~$0.1/GB, no action | usage-based |

---

## Architecture (scale-up reference — NOT the locked setup)

The sections below describe the fuller architecture for when the platform
scales beyond the locked single-instance setup above.

```
Route53 → CloudFront (CMS static + media, later) / ALB (TLS, ACM)
              │
              ├─ /api/* → Target Group → EC2/ECS backend(s) :3000
              │            (sticky sessions REQUIRED for socket.io multi-node)
              │
              ├─ /socket.io → same backend (websocket upgrade)
              │
              └─ CMS SPA → S3+CloudFront or nginx on same host (MVP)

Backend → MongoDB Atlas (replica set, PITR)
        → ElastiCache Redis (cache + future socket adapter)
        → S3 + CloudFront (media, after migration)
        → Secrets Manager (JWT_SECRET, DB creds, AWS keys if not IAM)
```

## Phase A — single-node MVP (week 1)

### 1. Network
- VPC with public + private subnets across 2 AZs.
- ALB in public subnets, ACM cert for `api.example.com` + `cms.example.com`.
- Backend EC2/ECS in private subnet; security group allows 3000 only from ALB SG.
- NAT gateway for outbound (MongoDB Atlas, Redis, S3).

### 2. Database
- MongoDB Atlas: M10+ replica set, 3 nodes, PITR backups, IP allowlist = VPC/NAT IPs.
- Run `DATABASE_MIGRATION_GUIDE.md` index verification + backfill script.

### 3. Redis
- ElastiCache `cache.t3.micro` single node (MVP) → Multi-AZ later.
- `REDIS_URL=redis://<endpoint>:6379`.

### 4. Compute
- EC2 `t3.large` (2 vCPU/8GB) or ECS Fargate 2 vCPU/4GB.
- Node 20+, `npm ci && npm run build`.
- PM2: `pm2 start ecosystem.config.js --instances 1` (**single instance** —
  socket.io is not multi-node yet).
- systemd unit or PM2 startup for reboot survival.

### 5. Nginx (on same host or separate)
- Use `nginx.conf` as base with fixes:
  - upstream → single `127.0.0.1:3000` (remove 3001–3003 until multi-node)
  - **delete `location /uploads/`** (auth bypass)
  - enable HTTPS server block (or terminate TLS at ALB and keep nginx :80)
  - `client_max_body_size 100m` (16MB chunks + headroom)
- CMS `dist/` served from nginx root or S3+CloudFront.

### 6. Env vars
- Set all vars per `ENVIRONMENT_VARIABLES.md`; pull secrets from Secrets Manager
  at boot (e.g. `aws secretsmanager get-secret-value` in start script) —
  do not write `.env` with secrets on disk.

### 7. Smoke test
- `/health`, CMS login, device activation, chunked upload >32MB, heartbeat,
  config push, media playback (206).

## Phase B — S3 + CloudFront media (before scaling)

**Code status: implemented.** `S3Storage` (`cloud-backend/src/config/storage.ts`)
uploads/deletes/moves objects; `serveMediaFile` (`app.ts`) keeps
`fileAccessAuth` then issues a **302 redirect to a short-lived signed URL** —
CloudFront canned-policy signed URL when `CDN_BASE_URL`+key pair are set,
otherwise an S3 presigned GET. `Media.url` stays `/api/media/file/...` so
**no DB/config/APK migration is needed**; per-file `storageType` lets local
and S3 objects coexist during transition.

Setup steps (AWS console):

1. S3 bucket (private, SSE-S3, block all public access), IAM role for EC2
   with `s3:GetObject/PutObject/DeleteObject` on that bucket only.
2. CloudFront distribution → S3 origin via **OAC**; cache policy honoring
   `Range`/`HEAD`; signed URLs **required** (trusted key group).
3. Upload CloudFront public key → key group → attach to distribution's
   "Trusted key groups". Set env: `STORAGE_TYPE=s3`, `S3_BUCKET_NAME`,
   `AWS_REGION`, `CDN_BASE_URL`, `CLOUDFRONT_KEY_PAIR_ID`,
   `CLOUDFRONT_PRIVATE_KEY`, optional `MEDIA_URL_EXPIRES_IN`.
4. New uploads land in S3 automatically. Old local files keep serving via
   `express.static` (per-file `storageType`).
5. Optional migration: copy `uploads/` → S3 preserving keys, then set each
   `Media.storageType='s3'` (path/url unchanged).
6. Lifecycle rules: abort incomplete multipart uploads after 7 days.
7. CloudFront invalidation on media delete is **not required** — signed URLs
   expire (`MEDIA_URL_EXPIRES_IN`, default 1h) and paths are unique per file.

## Cost optimization (do in this order)

Media bandwidth is ~90% of spend at 40k-device scale — Phase B is the big win.
After it:

1. **Reserved pricing** — EC2 1yr No-Upfront RI or Compute Savings Plan:
   40-60% off vs On-Demand. Apply once load test confirms steady state.
2. **Right-size** — with bytes off EC2, re-run `LOAD_TEST_REPORT.md` baseline;
   likely drop `t3.large` → `t3.medium`/`t3.small`.
3. **Graviton** — `t4g`/`m7g` instances ~20% cheaper than x86 equivalents.
4. **EBS gp3** — ~20% cheaper than gp2 at same performance.
5. **MongoDB Atlas** — right-size tier after index audit; keep PITR, drop to
   shared/dedicated-flexible if budget tight.
6. **ElastiCache** — `cache.t3.micro` is fine until socket adapter lands;
   revisit only then.
7. **CloudWatch** — set log group retention (7-30d), disable detailed
   monitoring; logs are a silent cost.
8. **Skip for now** — WAF, multi-AZ NAT, ASG: fixed monthly costs that only
   pay off at real scale or under attack.

## Phase C — horizontal scale

1. `@socket.io/redis-adapter` + ALB sticky sessions (`AWSALB` cookie) —
   see `SOCKET_SCALING.md`.
2. ASG: min 2, desired 2–4, health check `/health`, rolling deploys.
3. PM2 cluster or ECS desired count > 1.
4. Re-run load test; record in `LOAD_TEST_REPORT.md`.

## IAM / security

- EC2 instance role: S3 read/write (media bucket only), Secrets Manager read,
  CloudWatch logs. **No static AWS keys** when using IAM role.
- Security groups: ALB 80/443 public; backend 3000 from ALB only; MongoDB/Redis
  via private endpoints.
- WAF on ALB: rate-based rules, common exploit rules.
- S3 bucket policy: deny non-TLS, deny public access.

## CI/CD (recommended)

- GitHub Actions/GitLab CI: `npm ci && npm run build` → artifact → deploy.
- Backend: rolling restart via PM2/ECS; CMS: sync `dist/` to S3/nginx.
- DB migrations: none destructive; run index verification post-deploy.

## Cost notes (rough, ap-south-1)

- MVP: t3.large ~$60/mo + ALB ~$20 + Atlas M10 ~$60 + ElastiCache t3.micro ~$12
  + S3/CloudFront usage-based. Scale linearly with instances.
