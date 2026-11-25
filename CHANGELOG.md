# Changelog

Important code changes, bug fixes and features. Newest first.

## 2026-11-26 — S3/CloudFront media delivery, APK hash-first cache verify

- **S3 storage backend implemented** (`cloud-backend/src/config/storage.ts`):
  `S3Storage` now uploads (streamed — multipart-safe for multi-GB files),
  deletes, and moves (copy+delete) objects via aws-sdk v2. `getStorageService`
  accepts an optional per-record type so mixed local/S3 libraries work during
  migration; all delete/move call sites (`deleteMedia`, `updateMedia`,
  `purgeArchivedMedia`, `deleteUser`) now route by `Media.storageType`.
- **CDN delivery without URL migration**: `serveMediaFile` (`app.ts`) keeps
  `fileAccessAuth` (device/user JWT unchanged) then 302-redirects S3 media to
  a short-lived signed URL — CloudFront canned-policy signed URL when
  `CDN_BASE_URL`+`CLOUDFRONT_KEY_PAIR_ID`+`CLOUDFRONT_PRIVATE_KEY` are set,
  otherwise an S3 presigned GET. `Media.url` stays `/api/media/file/...` so
  DB records, device configs, schedule templates and the APK need **zero
  changes**; Range requests work natively on both signed URL types.
- **fileAccessAuth** now caches/stashes `storageType` per media path
  (`fileAccessCache` extended, backward-compatible with old cache entries).
- **APK hash-first cache verification** (`src/services/mediaService.ts`):
  `isManifestEntryUsable` now trusts the content hash over `mtimeMs`/`size`
  metadata — re-uploaded identical files (new `Media.updatedAt`) no longer
  trigger full re-downloads on every TV. Single gate covers prefetch,
  verify, storage preflight and generation copy.
- **AWS cost guide**: `docs/AWS_DEPLOYMENT_GUIDE.md` Phase B updated with
  the implemented delivery flow + console setup steps, and a cost
  optimization section (reserved pricing, right-sizing, Graviton, gp3,
  CloudWatch retention).

## 2026-11-26 — React Query migration, media thumbnails, error boundary, audit coverage, storage reconcile

- **React Query migration (CMS)**: all admin + user pages now fetch via
  `useQuery`/`useQueryClient` with cache invalidation instead of manual
  `useEffect`+`useState` fetching — `AdminDashboard`, `AdminStorage`,
  `AdminConfig`, `AdminDevices`, `AdminUsers`, `AdminMediaLibrary`,
  `AdminUserMediaDetail`, `AdminDeviceEdit`, `AdminGroups`,
  `UserDashboard`, `UserDevices`, `UserDeviceDetail` (kept manual — complex
  polling config editor), `UserLibrary`, `UserGroups`, `UserSubUsers`,
  `UserSchedules`, `UserSettings`. URL-param syncing (`useUrlParam`,
  `useUrlNumberParam`), skeleton loaders, bulk actions, and form
  validation preserved.
- **Media thumbnails**: new `MediaThumbnail` component
  (`cloud-frontend/src/components/MediaThumbnail.tsx`) — real image
  preview for `image/*` files (lazy-loaded, error fallback to type icon),
  icon for video/audio/other. Wired into `UserLibrary` (table + mobile
  card views; grid view already had previews) and `AdminUserMediaDetail`
  (mobile + desktop).
- **Error boundary**: new `ErrorBoundary` class component
  (`components/ErrorBoundary.tsx`) wrapping the whole app in `main.tsx` —
  render crashes now show a recoverable "Something went wrong" panel
  (Try again / Reload) instead of a white screen.
- **Audit log coverage**: previously only media upload/delete, device
  configure, and single-device assign were logged. Added `AuditLog.create`
  for `create_user`, `update_user` (includes `previousRole`/`newRole` on
  role change), `delete_user`, bulk `assignDevices`, `create_group`,
  `update_group` (with `previousName`), `delete_group`, and `delete_device`.
  `AuditLog` action enum extended with `update_user`/`update_group`.
- **Quota unit tests**: `tests/quota.test.ts` extended with limit-boundary
  cases (exact-limit allowed, +1 byte rejected, ops at limit-1 vs limit)
  and a sub-user case documenting that quota enforcement runs on the
  owner (parent) account counters.
- **Storage reconciliation**: new `services/storageReconcile.service.ts` +
  monthly job in `index.ts` — recomputes `user.storageUsed` from the actual
  `Media.size` sum per owner; auto-fixes drift ≤5% (or ≤1MB), logs larger
  drift for manual review. Runs on boot + first daily tick of each month.

## 2026-11-25 — Server-side pagination + shared UI components

- **Server-side pagination**: `AdminUserDevices` (assigned + available
  lists) and `AdminUserMediaDetail` now paginate/filter/search on the
  server instead of fetching `limit: 1000` and slicing client-side.
  Backend additions: `GET /api/devices?excludeAssignedUserId=` (admin),
  `GET /api/media?uploadedBy=` and `GET /api/media/folders?uploadedBy=`
  (admin-only). `AdminDashboard` users fetch reduced to `limit: 1`.
- **Config validation**: `PUT /api/config` rejects non-finite/negative
  numeric quota fields and non-string `apkVersion`/`apkUrl` with `400`.
- **Shared admin components** (`cloud-frontend/src/components/admin/`):
  `DeviceStatusBadge`, `MediaActions`, `Pagination` — replaced duplicated
  markup in `AdminDevices`, `AdminUserDevices`, `AdminUserMediaDetail`.
- **Toast + ConfirmDialog** (`components/ui/`): new `ToastProvider` +
  `useToast` (mounted in `AdminLayout`) and `ConfirmDialog` modal;
  replaced `alert()`/`confirm()` and custom alert banners in
  `AdminDevices`, `AdminUserDevices`, `AdminUserMediaDetail`,
  `AdminDeviceEdit`.
- **Responsive pass**: `AdminMediaLibrary`, `AdminDashboard`,
  `AdminConfig`, `AdminStorage`, `Login` — full-width containers,
  tighter padding, wrap-friendly pagination.

## 2026-11-25 — Quota wiring fixes (5 bugs)

- **Sub-user `GET /api/users/me` showed 0 usage** — usage counters now come
  from the parent (quota-owning) account for sub-users; response adds
  `quotaAccountId`. Month-reset also applies to the quota account.
- **Device-limit check corrected** (`POST /api/users/:id/devices`) — the
  limit is now compared against the FINAL assigned count
  (`deviceIds.length`), fixing false rejections when swapping devices
  within the limit.
- **Single-device config save now counts assign ops** — `PUT
  /api/devices/:id/config` runs `checkAssignQuota`/`recordAssign` like
  group configure and media assign did; `monthlyAssignOpsLimit` can no
  longer be bypassed via single-device saves.
- **Legacy `User.monthlyUploadLimit` field removed** from the schema —
  the effective limit always comes from `GlobalConfig`.
- **Chunked upload init rejects early when monthly upload-ops limit is
  reached** (was only checked at complete time, wasting bandwidth).

## 2026-11-25 — Admin quota CRUD + users list limit fix

- `AdminConfig` (`/admin/config`) now exposes ALL global quota fields:
  `storageLimitGB`, `monthlyUploadOpsLimit`, `monthlyAssignOpsLimit`,
  `maxDevicesPerUser`, `archivedMediaRetentionDays` (backend `PUT /api/config`
  already accepted them) + expanded settings summary.
- `GET /api/users` (admin list) no longer returns the stale legacy
  `User.monthlyUploadLimit` (always 10). Each row now carries the effective
  limit from `GlobalConfig.monthlyUploadLimitGB` (`null` for admins =
  unmetered), month-reset `currentMonthUpload`, and for sub-users the
  **parent account's** `storageUsed`/`currentMonthUpload` (sub-user uploads
  accrue to the parent). `AdminUsers` shows "Unlimited" for admins.

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
