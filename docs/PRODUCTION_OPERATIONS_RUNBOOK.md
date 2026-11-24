# Production Operations Runbook

Day-2 operations for the cloud signage platform.

## Deploy

```bash
# Backend (on EC2/ECS host)
cd cloud-backend
npm ci
npm run build
pm2 start ecosystem.config.js --instances 1   # single node until socket adapter
pm2 save && pm2 startup

# CMS
cd cloud-frontend
npm ci && npm run build
# deploy dist/ to nginx root, reload nginx
```

Post-deploy smoke test:
1. `curl https://api.example.com/health` → `{"status":"ok"}`
2. CMS login → dashboard loads
3. Trigger device config change → device receives `config:update` (socket) or next heartbeat
4. Upload a >32MB file (exercises chunked + fileHash path)
5. Play media on a TV → 206 ranged requests in backend logs

## Monitoring & alarms (CloudWatch)

- EC2/ECS CPU > 80% sustained, memory > 85%
- ALB 5xx rate > 1%, target response time p95 > 2s
- MongoDB Atlas: connections, opcounters, disk
- Redis: memory, evictions, hit rate
- App logs: `Heartbeat failed`, `Redis not available`, `File checksum mismatch`,
  `Chunk checksum mismatch` spikes
- Business: heartbeat volume drop (devices offline mass event)

## Routine tasks

| Task | Frequency | How |
|---|---|---|
| Review audit logs | weekly | `auditlogs` collection / admin UI |
| Check disk usage `uploads/` | daily | CloudWatch agent / `df -h` |
| Verify backups | weekly | Atlas backup status; restore drill quarterly |
| Rotate JWT_SECRET | planned | Deploy new secret → rolling restart (invalidates all tokens — schedule maintenance window) |
| Review rate-limit hits | weekly | backend logs / nginx |
| APK version bump | per release | `GlobalConfig.apkVersion`/`apkUrl` |

## Common operations

### Device not syncing
1. Check device `lastSeen`/`status` in CMS or `db.devices.findOne({deviceId})`.
2. Check `configVersion` — if stale, next heartbeat resends config.
3. `POST /api/devices/:id/retry-cloud-sync` (CMS button) forces sync.
4. Check APK logs for `Heartbeat failed` / activation errors.

### Force config push to device/group
- Update config via CMS → socket `config:update` emitted; offline devices get it on next heartbeat (configVersion mismatch).

### Emergency alert
- CMS → device/group → Emergency → message or media. Clears via heartbeat convergence even if socket missed.

### Clean orphaned chunked uploads
- Sessions auto-expire after 24h (`SESSION_TTL_MS`); manual: delete dirs under
  `uploads/temp/chunked/<userId>/` older than 24h.

### Add admin user
- `TEST_ADMIN_*` env (dev only) or create via admin UI / `db.users.insertOne` with bcrypt hash.

## Scaling triggers

- CPU sustained > 70% → add instance (after socket adapter + S3 done).
- MongoDB ops/sec approaching limits → review indexes, then evaluate read replicas.
- Media egress high → move to CloudFront (planned).
- Device count > 100k → re-evaluate socket strategy (SOCKET_SCALING.md).

## Contacts / escalation

- Backend logs: `pm2 logs nvaplayer-backend`
- Nginx logs: `/var/log/nginx/nvaplayer_*.log`
- Atlas metrics: Atlas console → cluster → metrics
- Escalate: on-call rotation [TO BE DEFINED before go-live]
