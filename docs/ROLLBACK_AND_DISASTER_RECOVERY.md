# Rollback & Disaster Recovery

## Rollback scenarios

### Application rollback (bad deploy)

1. **Backend**: PM2 keeps previous build? No — redeploy previous artifact:
   `git checkout <previous-tag> && cd cloud-backend && npm ci && npm run build && pm2 restart nvaplayer-backend`.
   DB changes are additive (indexes/TTL) — old code runs fine against them.
2. **CMS**: rebuild previous commit and redeploy `dist/` to nginx root.
3. **APK**: devices keep last working version; push rollback via APK update
   mechanism (`GlobalConfig.apkVersion`/`apkUrl`) if a bad APK shipped.

### Database rollback

- No destructive migrations have been applied — nothing to roll back.
- `backfill-assigned-devices.js` is add-only; if needed, unset
  `Media.assignedDevices` and re-run.
- Index drops (if a bad index hurts writes): `db.<coll>.dropIndex("<name>")`.

### Media storage rollback

- Local → S3 migration: keep `uploads/` until S3 verified; rollback = set
  `STORAGE_TYPE=local` and restore `Media.url`/`path` values (keep a DB dump
  before migration).

## Disaster recovery

### MongoDB Atlas

- Enable **continuous backups + PITR** on the cluster (required before prod).
- Restore: Atlas console → Backup → restore to new cluster → update
  `MONGODB_URI` → restart backend. RPO ~minutes (PITR), RTO ~30–60 min.
- Quarterly drill: restore to a scratch cluster and run smoke tests.

### Redis

- Cache-only — no source of truth. Loss = cold caches (device summaries,
  media-auth lookups rebuild from Mongo). No restore needed; ElastiCache
  Multi-AZ for availability.

### Media files (local disk phase)

- `uploads/` is **not backed up by default** — single EC2 loss = media loss.
  Mitigations: (a) move to S3+CloudFront (planned), or (b) nightly `aws s3 sync`
  / EBS snapshot of the upload volume until S3 lands.
- Chunked-upload temp sessions (`uploads/temp/chunked/`) are disposable — safe to lose.

### Full-region failure

- Multi-AZ ASG + ALB handles AZ loss. Region loss requires DR runbook:
  provision second region, restore Atlas backup, redeploy — document RTO/RPO
  targets before go-live.

## Incident response quick refs

| Symptom | First check |
|---|---|
| Devices offline | `/health`, backend logs, MongoDB connectivity, Redis |
| Config not pushing | device `configVersion` vs DB, socket connectivity, heartbeat logs |
| Media 403/404 | `fileAccessAuth` logs, device activation status, media `path` |
| Upload failures | disk space on `UPLOAD_DIR`, session TTL cleanup, nginx `client_max_body_size` |
| High latency | CPU/RAM, Mongo slow queries, Redis hit rate, media disk I/O |
