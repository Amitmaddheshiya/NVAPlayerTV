# Deployment

## Build

### APK (Android TV)

```bash
npm install
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease --console plain
# output: android/app/build/outputs/apk/release/NVA-SignagePlayerTV.apk
```

Bump `versionCode`/`versionName` in `android/app/build.gradle` every release.
Install: `adb install -r <apk>`.

### Cloud backend

```bash
cd cloud-backend
npm ci
npm run build        # tsc → dist/
npm start            # node dist/index.js
# or: pm2 start ecosystem.config.js --instances 1   # SINGLE instance until socket adapter
```

### Cloud CMS

```bash
cd cloud-frontend
npm ci
npm run build        # vite → dist/
# serve dist/ via nginx (see nginx.conf)
```

## Environment variables

Full list in `docs/ENVIRONMENT_VARIABLES.md`. Critical:

- `MONGODB_URI` — required
- `JWT_SECRET` — required in production (app refuses to start without it)
- `NODE_ENV=production`
- `SERVER_URL` — public backend URL (used in media URLs)
- `FRONTEND_URL` — CMS origin (CORS)
- `REDIS_URL` — Redis/ElastiCache (optional but recommended)
- `STORAGE_TYPE` / `S3_*` — only when S3 migration done
- `TEST_ADMIN_*` — **unset in production**
- CMS: `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_SERVER_URL` in `.env.local`

## Nginx (production fixes required)

From `nginx.conf`:

1. **Upstream → single `127.0.0.1:3000`** (remove 3001–3003 until multi-node).
2. **Delete `location /uploads/`** — bypasses media auth.
3. Enable HTTPS server block (ACM cert or terminate at ALB).
4. Keep `client_max_body_size 100m` (16MB chunks + headroom).
5. Serve CMS `dist/` at `/` with SPA fallback.

## AWS deployment

See `docs/AWS_DEPLOYMENT_GUIDE.md` — phased: single-node MVP → S3/CloudFront →
horizontal scale (socket adapter + sticky sessions). MongoDB Atlas replica
set + PITR; ElastiCache Redis; Secrets Manager for secrets.

## Post-deploy smoke test

1. `curl https://api.example.com/health` → `{"status":"ok"}`
2. CMS login → dashboard loads
3. Device activation → heartbeat → config push (socket + heartbeat paths)
4. Upload >32MB file (chunked + whole-file hash path)
5. Media playback on TV → 206 ranged requests
6. Emergency alert → device receives, clears on heartbeat convergence
7. Quota: `GET /api/users/me` returns `usage` object; dashboard "Your Plan
   & Usage" card shows live counters; exceeding limits returns 400/429
   with readable error (see `API.md` → Quotas)

## Rollback

See `docs/ROLLBACK_AND_DISASTER_RECOVERY.md`. DB changes are additive
(indexes/TTL) — old code runs fine; media URL migrations are idempotent
scripts.
