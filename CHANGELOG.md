# Changelog

Important code changes, bug fixes and features. Newest first.

## 2026-11-25 — Config history capped at 2

- `Device.configHistory` and `Group.configHistory` now keep only the last 2
  entries (was 20) — write paths slice(0,2) in `device.controller.ts` /
  `group.controller.ts`; history endpoints also slice(0,2) so legacy records
  display at most 2.

## 2026-11-25 — Per-account quota system + usage dashboard

- New `cloud-backend/src/utils/quota.ts` — centralized quota checks:
  `checkUploadQuota`/`recordUpload` (storage cap, monthly bytes, monthly
  upload ops), `checkAssignQuota`/`recordAssign` (monthly assign ops),
  `checkDeviceLimit` (max TVs per account). Monthly counters reset lazily
  via `uploadUsageMonth` (`YYYY-MM`).
- `GlobalConfig` new fields (admin-tunable via `PUT /api/config`):
  `storageLimitGB` (1), `monthlyUploadOpsLimit` (10),
  `monthlyAssignOpsLimit` (15), `maxDevicesPerUser` (4),
  `archivedMediaRetentionDays` (30). `singleUploadLimitMB` default → 500.
- `User` model: `monthlyUploadOps`, `monthlyAssignOps` counters.
- Enforcement points: `uploadMedia` + chunked-upload init/complete
  (storage/bytes/ops), `assignMedia` + `configureGroup` (assign ops),
  `createDevice`/`updateDevice`/`assignDevices` (device limit).
  Admin uploads/assignments are unmetered.
- `GET /api/users/me` now returns a `usage` object (storage, monthly
  upload, uploadOps, assignOps, devices, fileSizeLimitMB).
- New daily `purgeArchivedMedia` job (`index.ts`): permanently deletes
  archived media (`deletedFromLibrary`) older than retention — only when
  no device config or schedule template still references it.
- CMS: `UserDashboard` "Your Plan & Usage" card (all quotas live),
  storage card shows real 1GB limit; `UserLibrary` shows backend quota
  error messages in alert dialog + storage used/limit.
- Tests: `tests/quota.test.ts` (upload/assign/device-limit/getMe/assign-429).

## 2026-11-24 — Production readiness docs + media URL fix

- Added 8 project docs: `README.md` (updated), `ARCHITECTURE.md`,
  `DATABASE.md`, `API.md`, `SECURITY.md`, `DEPLOYMENT.md`, `CHANGELOG.md`,
  `TESTING.md`.
- Deleted `IMPLEMENTATION_SUMMARY.md` (superseded) and
  `cloud-frontend/README.md` (boilerplate).
- Added `cloud-backend/scripts/fix-media-url-hosts.js` — rewrites stale media
  URL origins to current `SERVER_URL` (idempotent, `--dry-run`).
- Ran it on dev DB: 12 `Media.url` docs migrated `192.168.1.4` → `192.168.1.3`.
- Added `VITE_SERVER_URL` to `cloud-frontend/.env.local`.
- Load test executed (500 devices, 100 workers, 60s): heartbeat 138.9 req/s
  0 errors; media 24.7 req/s (~25MB/s), 6 errors (0.41%) — recorded in
  `docs/LOAD_TEST_REPORT.md`.

## 2026-11-23 — Fixes-first track complete (30 items)

See `docs/PRODUCTION_PROGRESS.md` for the full itemized list. Highlights:

- Backend: `src/app.ts` extracted from `index.ts`; Jest+supertest suite
  (27 tests); indexes (Group.devices multikey, Device sort, AuditLog TTL);
  body limit 1mb; device-list summary cache; heartbeat socket throttle;
  `GET /groups/:id`; `configureGroup` uses `processConfigForStorage`;
  `assignedDevices` completeness (backfill + sync hooks); load-test harness.
- CMS: device-list socket merge fix; fresh socket token per connect;
  axios 60s timeout; chunked upload whole-file SHA-256
  (`src/utils/sha256.ts`); `GET /groups/:id` usage.
- APK: `cloudService.test.ts` (18 tests); sync-progress throttle; dead
  `command-response` removed; whole-file hash support.
- Backend chunked upload: whole-file SHA-256 verify on complete
  (`chunkedUpload.controller.ts`).

## Earlier

- Cloud mode: device activation, heartbeat config sync, emergency alerts,
  offline media cache with staged generations, schedule templates,
  sub-user RBAC, chunked/resumable uploads.
- LAN mode: TV-hosted embedded CMS, QR access, USB playback, kiosk
  auto-reopen (see README APK section).
