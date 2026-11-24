# AWS Deployment Guide

Target architecture for the signage cloud platform. Start single-node
(Implementation Plan Step 1), scale after S3/CloudFront + socket adapter.

## Architecture

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

1. S3 bucket (private, SSE-S3, versioning optional), CloudFront OAC.
2. Backend `STORAGE_TYPE=s3`; signed URLs for media access.
3. Migration script: copy `uploads/` → S3, update `Media.path`/`url`.
4. Verify ranged playback through CloudFront.
5. Lifecycle rules: multipart abort cleanup, temp prefix expiry.

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
