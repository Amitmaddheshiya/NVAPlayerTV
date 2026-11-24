# Production Readiness Audit

Date: 2026-11-23 (updated after fixes-first track)
Scope: `cloud-backend`, `cloud-frontend`, Android TV APK (`src/`), deployment configs.
Target: 10k users / 40k devices initial; 100k+ / 1M+ future (unproven until load-tested).

## Status summary

All 30 items in `docs/PRODUCTION_PROGRESS.md` are IMPLEMENTED or ANALYZED.
Backend: 27 API tests PASS (`npm test`), `tsc` clean.
APK: 18 cloudService regression tests + existing suites PASS (`npx jest`).
CMS: `tsc -b` clean.

## Verified strengths (evidence-based)

- **AuthN/AuthZ**: JWT for users + devices; `deviceAuth`/`auth`/`adminOnly` middleware; sub-user `resourceAccess` scoping enforced on devices, groups, schedules, media (tested).
- **Media access**: `/api/media/file` behind `fileAccessAuth` — device tokens (query param for Range-capable players) or user bearer; per-device configured-media check incl. schedule profiles + emergency media; Redis-cached lookups.
- **Upload integrity**: per-chunk SHA-256 (optional client-side), whole-file SHA-256 end-to-end for chunked uploads (>32MB), assembled-size check, mime/extension allowlist, per-user session dirs, upload limits (count/size/monthly quota).
- **Media delete safety**: `deleteMedia` blocks files referenced by device configs, schedule profiles, schedule templates, legacy `mediaUrls`.
- **Config sync correctness**: `configVersion` acked by APK only after media-cache verification + commit; heartbeat resends stale configs; socket + heartbeat emergency-alert convergence.
- **Rate limiting**: global `/api` limiter (env-configurable), disabled in `NODE_ENV=development`.
- **Body limits**: 1mb JSON (measured max config <1KB; schedule profiles bounded at 20/device).
- **Indexes**: `Group.devices` multikey, `Device.{updatedAt}`, `{assignedUserId,updatedAt}`, `AuditLog` TTL 90d — auto-created on restart (`autoIndex`).

## Known risks / gaps (must resolve before go-live)

### CRITICAL

1. **Socket.io is single-node only.** `ecosystem.config.js` runs PM2 `cluster` (`instances: 'max'`) and `nginx.conf` upstream lists 4 backend ports — but there is **no Redis adapter and no sticky sessions**. Socket events (config:update, device:heartbeat, emergency) only reach clients connected to the same node. See `docs/SOCKET_SCALING.md`.
   - **Decision needed**: either (a) run backend as a single PM2 instance behind nginx until Redis adapter lands, or (b) implement `@socket.io/redis-adapter` + ALB sticky sessions (Phase 1 item 3).
2. **Nginx `/uploads/` location bypasses auth.** `nginx.conf` serves `/uploads/` statically with no auth. Media URLs use `/api/media/file/...` (authenticated), but if any client ever requests `/uploads/<path>` directly it is public. Remove the location block or restrict it.
3. **Nginx upstream/backend port mismatch.** Upstream expects 3000–3003; PM2 cluster binds only PORT=3000 (cluster shares one port). Either fix upstream to a single `127.0.0.1:3000` or run 4 separate PM2 apps on 3001–3003.

### HIGH

4. **Local disk media storage.** `STORAGE_TYPE=local` default; `uploads/` on EC2 local disk is lost on instance replacement and doesn't scale horizontally. S3 + CloudFront is Phase 1 item 1 — required before multi-instance or ASG deployment.
5. **No automated backups documented yet** — see `ROLLBACK_AND_DISASTER_RECOVERY.md`; MongoDB Atlas backup/PITR must be enabled.
6. **CORS origin list contains dev origins** (`localhost:5173/5174`, `127.0.0.1:52844/54608`) — harmless but should be env-driven only in production.
7. **APK changes pending rebuild**: items #15 (sync-progress throttle), #18 (dead command-response removal), #19 (tests) require a new APK build before production rollout.

### MEDIUM

8. **Picker pages fetch `limit=1000`** (AdminUserDevices, LibraryModal, etc.) — fine at current scale; revisit >1000 users/devices per account.
9. **`Device.config` storage amplification** — currently zero (0/40k devices have schedule profiles); if schedules are adopted, profiles embed full config snapshots (max 20/device). Mitigation documented in progress #28.
10. **Load-test numbers are dev-baseline only** — rerun `npm run load-test` against compiled `npm start` before quoting capacity. See `LOAD_TEST_REPORT.md`.
11. **Redis optional** — app degrades gracefully without it, but device-summary cache, media-auth cache, and (future) socket adapter all depend on it; production must run Redis/ElastiCache.

### LOW / accepted

12. `deleteMedia` full device-config scan kept intentionally (correctness > speed) — 40k docs scan is acceptable; revisit if device count grows 10x.
13. Test admin (`config/testAdmin.ts`) — ensure `TEST_ADMIN_*` env vars are NOT set in production unless intended.

## Test coverage snapshot

| Suite | Count | Scope |
|---|---|---|
| Backend Jest (`cloud-backend/tests`) | 27 | auth, device ownership, groups/sub-user access, schedules, media-delete protection |
| APK Jest (`src/services/*.test.ts`) | 18+ | cloudService pipeline, scheduleService, cloudMediaUrl, slideRendererUtils, videoPlaybackState |
| Load harness | — | `scripts/load-test.js` heartbeat + ranged media GET |

## Go-live gate

Do NOT deploy to production until: CRITICAL items 1–3 resolved, APK rebuilt with pending changes, load test rerun on compiled backend, and `SECURITY_CHECKLIST.md` fully checked.
