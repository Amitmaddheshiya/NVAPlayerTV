# Production Progress Tracker

This file tracks execution status for the enterprise production roadmap.
Read `ENTERPRISE_PRODUCTION_MASTER_PLAN.md` first — it is the authoritative brief.

Status values: `NOT STARTED`, `IN PROGRESS`, `IMPLEMENTED`, `TESTED`, `VERIFIED`, `BLOCKED`.

## Execution track decision (2026-11-23)

- **Option A chosen: fixes-first track.** Critical confirmed bugs and security fixes
  (Fix Priorities 1-8 below) are implemented BEFORE the full master-plan `PHASE 1`
  scope (S3/CloudFront, Socket.io Redis adapter, multi-instance).
- Master plan `PHASE 1`-`PHASE 5` commands remain the authoritative phase gates.
  This tracker maps fix priorities into those phases so nothing is lost.
- LAN-based features remain untouched: `server/` (embedded CMS), LAN config/media
  paths in `src/services/configService.ts`, `mediaService.ts` LAN sync,
  `src/player/PlayerScreen.tsx`, `embeddedCmsService.ts`, USB playback, license.

## Fix Priority Roadmap (mapped to master phases)

### Track A — Critical fixes (pre-master-phase work, authorized 2026-11-23)

| # | Item | Master phase | Status |
|---|------|--------------|--------|
| 1 | Index `Media.path` (unique) + `Media.url`; preflight duplicate check + rollback plan | PHASE 1 item 5 | VERIFIED — `npm run indexes:media` ran clean: no dup paths, `path_1` (unique) + `url_1` created on live DB |
| 2 | Redis-cache `fileAccessAuth` lookups (media-path, device allowed-paths; ~60s TTL + invalidation) | PHASE 1 item 5 | IMPLEMENTED — `tsc` build PASS; runtime verify: stream video from device, confirm Redis keys `fileauth:*` populate; test config change → new media allowed immediately |
| 3 | Fix RegExp cache-key collision in `getMedia`, `getDevices`, `getGroups`, `getUsers` | PHASE 2 item 2 | IMPLEMENTED — cache keys now built from raw query params; `tsc` PASS; verify: two different `?search=` values return different results |
| 4 | Remove per-heartbeat `cacheDelPattern('devices:*')` in `device.controller.ts` heartbeat | PHASE 2 item 1 | IMPLEMENTED — purge removed; all real mutation paths still invalidate; `tsc` PASS; verify: `MONITOR` Redis during heartbeats shows no SCAN |
| 5 | Enforce sub-user `resourceAccess` in `schedule.controller.ts` | PHASE 3 item 2 | IMPLEMENTED — `canAccessTarget` now checks resourceAccess for device+group; update/delete also verify target access; `tsc` PASS; verify: sub-user with devices=[A] gets 403 for device B schedule |
| 6 | Disable duplicate legacy media sync (`offlineService.syncMedia` + `mediaCacheService`) on APK | PHASE 2 item 1 | IMPLEMENTED — periodic `syncMedia()` call removed from `offlineService` 60s loop; `mediaCacheService`/`getMediaUrl` left intact (dead code, harmless); **APK rebuild required** |
| 7 | Dedicated stricter rate limit for `/api/auth/login` + `/api/auth/register` | PHASE 1 item 7 | IMPLEMENTED — `authRateLimit` = 20 req/15min/IP/path on top of global 100; dev mode skip preserved; `tsc` PASS; verify: 21st login attempt in window → 429 |
| 8 | APK socket `reconnectionAttempts: Infinity` | PHASE 2 item 5 | IMPLEMENTED — unlimited retries + `reconnectionDelayMax: 30000`; **APK rebuild required**; verify: airplane mode >5min → restore → socket reconnects without restart |

### Track B — Remaining fix priorities (after Track A)

| # | Item | Master phase | Status |
|---|------|--------------|--------|
| 9 | Index `Group.devices` + batch schedule sync (N+1 fix) | PHASE 2 item 2 | IMPLEMENTED — `devices:1` multikey index added (autoIndex on restart); `getTemplatesForDevices` batch fn: 2 queries for N devices; `configureGroup`/`syncScheduleForTarget`/`syncScheduleForDevices` use it; `tsc` PASS; verify: `db.groups.getIndexes()` + time 100-device group configure |
| 10 | `AuditLog` TTL index | PHASE 2 item 2 | IMPLEMENTED — TTL 90 days on `timestamp` (autoIndex on restart); verify: `db.auditlogs.getIndexes()` shows expireAfterSeconds |
| 11 | `Device` sort index for `{updatedAt:-1}` | PHASE 2 item 2 | IMPLEMENTED — `{updatedAt:-1}` + `{assignedUserId:1,updatedAt:-1}` added (autoIndex on restart) |
| 12 | Raise `express.json()` body limit after payload measurement | PHASE 2 | IMPLEMENTED — measured via `scripts/check-config-sizes.js`: max device.config 0.7KB (40k docs), groups ~0KB; set `1mb` limit on json+urlencoded; `tsc` PASS |
| 13 | Slim `deleteMedia` device config scan (verify `assignedDevices` reliability first) | PHASE 2 item 2 | DONE — `backfill-assigned-devices.js` executed on live DB (40k devices scanned, 0 media refs → no writes; add-only, safe to re-run on production). **Scan intentionally NOT slimmed** — `Device.config` stays source of truth; `assignedDevices` is derived data that can drift. Correctness > micro-optimization |
| 14 | Throttle `pushDeviceHeartbeat` socket emits | PHASE 2 item 1 | IMPLEMENTED — per-device throttle: immediate on status/appVersion/storage change, else max 1 emit/60s; `tsc` PASS; verify: `device:heartbeat` rate drops ~667/s → ~40k/min worst case |
| 15 | Throttle APK cloud sync progress reports | PHASE 2 item 1 | IMPLEMENTED — progress POSTs capped at 1/5s (completion always reports); **APK rebuild required** |
| 16 | Cache non-admin device-list summary | PHASE 2 item 1 | IMPLEMENTED — `devices:summary:{ownerId}` Redis key, 30s TTL, auto-invalidated by `devices:*` purges; `tsc` PASS |
| 17 | Add `GET /groups/:id` endpoint + update CMS pages | PHASE 3 item 1 | IMPLEMENTED — `getGroup` controller + route (canAccessGroup checks); `groupAPI.getGroup`; `UserSchedules` (2 spots) + `UserGroupConfigure` now fetch single group instead of limit=1000 list scan; `tsc` PASS |
| 18 | Remove/implement dead `command-response` call in `cloudService.ts` | PHASE 2 | IMPLEMENTED — removed `sendCommandResponse` (no callers, no backend route); **APK rebuild required** |
| 19 | APK cloud pipeline regression tests | PHASE 4 | IMPLEMENTED — `src/services/cloudService.test.ts`: 18 tests covering initialize (appMode/URL normalization), ensureDeviceAuthToken (cache/refresh/deactivate/disabled), sendHeartbeat (configVersion -1 vs persisted, config storage + config:update event, NO early version ack — regression guard, emergency alert/clear events, device:not_registered 404), fetchConfig/getMediaList/reportPlaybackError bounds/downloadMedia; AsyncStorage+DeviceInfo+RNFS+fetch+EventEmitter mocked; `npx jest src/services/cloudService.test.ts` PASS |
| 20 | CMS device-list socket merge fix (`subscribeToDeviceUpdates`) | PHASE 3 | IMPLEMENTED — Dashboard.tsx now merges heartbeat payload into existing device instead of replacing (was wiping group/assignedUserId/health) |
| 21 | CMS socket auth fresh token per connect | PHASE 3 | IMPLEMENTED — `auth` callback reads localStorage token on every (re)connect |
| 22 | Real pagination on Devices/Library/Users/admin lists | PHASE 3 item 1 | VERIFIED EXISTING — AdminDevices, AdminUsers, AdminMediaLibrary, UserDevices, UserGroups, UserLibrary all use server-side page/limit + pagination UI. Residual: picker pages (AdminUserDevices, LibraryModal, etc.) still fetch limit=1000 for selection — acceptable for now, revisit if user counts exceed 1000 |
| 23 | Axios request timeout in CMS | PHASE 3 | IMPLEMENTED — 60s global timeout; uploads (chunk PUT + small POST) opt out with `timeout: 0` |
| 24 | Reuse `processConfigForStorage` in `configureGroup` | PHASE 2 | IMPLEMENTED — replaced ~60 lines of inline processing with shared `processConfigForStorage` (same as updateConfig); gains section field cleaning; `tsc` PASS |
| 25 | Whole-file hash for chunked uploads (optional) | PHASE 1 item 2 | IMPLEMENTED — CMS streams SHA-256 of the whole file during chunk upload (new `src/utils/sha256.ts` streaming impl, verified vs Node crypto incl. 1MB multi-update); sent as `fileHash` in complete request (skipped on resumed uploads); backend `completeChunkedUpload` validates + compares against assembled file → 400 on mismatch. Per-chunk hashes unchanged. `tsc` PASS both sides |
| 26 | Backend API test suite (Jest + supertest) | PHASE 4 | IMPLEMENTED — `src/app.ts` extracted (index.ts refactored, no behavior change); Jest+ts-jest+supertest; tests run on dedicated `signage_test` DB (same Mongo instance, collections wiped per test); Redis mocked; 27 tests / 5 suites PASS covering auth, device ownership, group access (incl. sub-user resourceAccess), schedule sub-user enforcement, media-delete in-use protection; `npm test` |
| 27 | Load-test harness (heartbeat + ranged media GET) | PHASE 4 | IMPLEMENTED — `scripts/load-test.js` (`npm run load-test`): `--seed N` creates N activated `lt-dev-*` devices + 8MB media file, `--devices/--concurrency/--duration/--phase heartbeat|media|both`, `--cleanup` removes all; mints real device JWTs, steady-state heartbeat (configVersion synced → no config payload), Range GET via `?deviceToken=` (same as Android player). Verified: heartbeat 200s, media 206 partial content. Baseline on ts-node dev (50 dev, 20 workers, 10s): heartbeat ~80 req/s p50 235ms; media ~14.5 req/s (1MB ranges, ~14MB/s) p50 1.37s — rerun against `npm start` (compiled) for production numbers |
| 28 | Review `Device.config` storage amplification (after load data) | PHASE 2 item 6 | ANALYZED — `scripts/analyze-config-size.js` on live DB: 40k devices, all have config, **0 devices have schedule profiles** → amplification currently zero; max config 0.7KB. Risk only materializes if schedules are adopted at scale (profiles embed full config snapshots, max 20/device). Recommendation if that happens: store profile configs in ScheduleTemplate and reference by ID. No action needed now |
| 29 | Socket.IO multi-node readiness doc (sticky sessions + Redis adapter) | PHASE 1 item 3 / PHASE 5 | IMPLEMENTED — `docs/SOCKET_SCALING.md`: current single-node limits, required changes (sticky sessions, `@socket.io/redis-adapter`, revoke verification), checklist |
| 30 | NEW: `assignedDevices` completeness — include `config.mediaUrls` + `config.schedule.profiles` media in updateConfig/configureGroup syncs; extend `deleteMedia` scan to schedule profiles; backfill script for existing data | PHASE 2 item 2 | IMPLEMENTED — `getConfiguredMediaUrls` helper; updateConfig + configureGroup (per-device sets) syncs complete; deleteMedia covers schedule profiles + ScheduleTemplate check; `scripts/backfill-assigned-devices.js` (add-only, dry-run verified: 40k test devices, 0 media refs); `tsc` PASS |
| 31 | Per-account quota system (billing control): 1GB storage, 500MB file, 10 uploads/mo, 15 assigns/mo, 4 TVs, 30-day archived purge; live usage on dashboard | PHASE 3 item 2 | IMPLEMENTED — `src/utils/quota.ts`; GlobalConfig quota fields; User `monthlyUploadOps`/`monthlyAssignOps`; enforcement in uploadMedia/chunkedUpload/assignMedia/configureGroup/createDevice/updateDevice/assignDevices; `GET /users/me` `usage` object; daily `purgeArchivedMedia` job (skips in-use files); CMS dashboard "Your Plan & Usage" card + library error surfacing; `tests/quota.test.ts` (9 tests PASS); `tsc` PASS both sides |
| 32 | Audit log coverage gaps — user CRUD, role change, bulk assign, group CRUD, device delete were unlogged | PHASE 2 | IMPLEMENTED — `AuditLog.create` added in `createUser`/`updateUser` (role change logs `previousRole`/`newRole`)/`deleteUser`/`assignDevices` (user.controller), `createGroup`/`updateGroup`/`deleteGroup` (group.controller), `deleteDevice` (device.controller); enum extended with `update_user`/`update_group`; `tsc` PASS |
| 33 | CMS React Query migration + media thumbnails + error boundary | PHASE 3 | IMPLEMENTED — all admin/user pages on `useQuery`/`useQueryClient` (UserDeviceDetail kept manual for polling config editor); `MediaThumbnail` component wired into UserLibrary + AdminUserMediaDetail; `ErrorBoundary` wraps app in `main.tsx`; `tsc` PASS |
| 34 | Storage reconciliation job (`storageUsed` vs actual `Media.size` sum) | PHASE 2 | IMPLEMENTED — `services/storageReconcile.service.ts` + monthly job in `index.ts` (boot + first daily tick per month); auto-fixes drift ≤5%/≤1MB, logs larger drift; `tsc` PASS |
| 35 | S3 storage backend + CDN media delivery (no URL migration) | PHASE 1 item / PHASE B | IMPLEMENTED — `S3Storage` (streamed upload, delete, copy+delete move); `serveMediaFile` 302-redirects s3 media to signed URL (CloudFront canned policy when `CDN_BASE_URL`+key pair set, else S3 presign); `Media.url` format unchanged → zero DB/config/APK migration; per-file `storageType` routing in delete/move/purge/user-delete; `fileAccessCache` carries storageType; env vars `CDN_BASE_URL`/`CLOUDFRONT_KEY_PAIR_ID`/`CLOUDFRONT_PRIVATE_KEY`/`MEDIA_URL_EXPIRES_IN`; `tsc` PASS. **AWS console setup pending** (bucket, OAC, key group) per `AWS_DEPLOYMENT_GUIDE.md` Phase B |
| 36 | APK hash-first cache verification | PHASE 2 | IMPLEMENTED — `isManifestEntryUsable` trusts content hash over mtimeMs/size drift; re-uploaded identical files skip re-download on all TVs; single gate covers prefetch/verify/preflight/generation-copy; jest 30/30 PASS; **APK rebuild required** |
| 37 | Production setup LOCKED: EC2 t3.small single instance + Atlas M0 (free) + S3/CloudFront + Caddy SSL; no Redis/ALB/NAT; ~$15–20/mo for 20 users/40 devices; scaling path documented | PHASE 5 | DECIDED — zero code changes required (env vars + AWS console only); step-by-step deploy checklist + scaling triggers in `AWS_DEPLOYMENT_GUIDE.md` "LOCKED production setup" section. **Pending:** AWS console execution at go-live |

## Master plan phases (authoritative gates)

- `PHASE 1` — critical architecture, security, storage (S3/CloudFront, Redis socket adapter, media indexes, auth hardening)
- `PHASE 2` — backend, database, scalability
- `PHASE 3` — frontend, tenancy, enterprise features
- `PHASE 4` — QA, security, load testing
- `PHASE 5` — AWS production deployment

## Required docs (per master plan) — status

| Doc | Status |
|-----|--------|
| `docs/PRODUCTION_READINESS_AUDIT.md` | REMOVED (point-in-time audit, superseded by this file) |
| `docs/PRODUCTION_IMPLEMENTATION_PLAN.md` | REMOVED (superseded by `AWS_DEPLOYMENT_GUIDE.md` locked setup + this file) |
| `docs/PRODUCTION_PROGRESS.md` | THIS FILE |
| `docs/AWS_DEPLOYMENT_GUIDE.md` | EXISTS — locked lean setup + scale-up phases |
| `docs/DATABASE_MIGRATION_GUIDE.md` | EXISTS — index verify + backfill for prod DB |
| `docs/SECURITY_CHECKLIST.md` | EXISTS |
| `docs/LOAD_TEST_REPORT.md` | EXISTS — harness usage + baseline numbers |
| `docs/ROLLBACK_AND_DISASTER_RECOVERY.md` | EXISTS |
| `docs/ENVIRONMENT_VARIABLES.md` | EXISTS |
| `docs/PRODUCTION_OPERATIONS_RUNBOOK.md` | EXISTS |
| `docs/SOCKET_SCALING.md` | EXISTS — multi-node path reference |
| `docs/ENTERPRISE_PRODUCTION_MASTER_PLAN.md` | EXISTS — authoritative phase brief |

## Rules reminder

- One fix priority at a time; test before marking `TESTED`; report to user and wait.
- No destructive git operations; preserve existing edits.
- LAN paths untouched (see list above).
- No paid dependencies.
- APK changes (fix #6, #8, #15, #18, #19) require APK rebuild + device deploy.
