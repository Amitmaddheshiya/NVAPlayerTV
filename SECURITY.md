# Security

## Authentication

- **User JWT** — bcrypt passwords (cost 10; 12 for test admin), JWT signed
  with `JWT_SECRET` (**mandatory in production** — app refuses to start
  without it). Login/register rate-limited.
- **Device JWT** — issued on activation; 1h TTL; APK auto-refreshes via
  `ensureDeviceAuthToken`. Deactivated/unregistered devices → 404 → APK
  shows activation screen.
- **No public signup admin** — role cannot be self-granted.

## Authorization

- Middleware: `auth` (user), `deviceAuth` (device), `adminOnly`,
  `userOrAdmin`, `requirePermission(module)`.
- **Sub-users**: `resourceAccess` scoping enforced on devices, groups,
  schedules, media — verified by backend tests.
- Non-admin users only access assigned devices/groups; group-managed devices
  reject direct config saves (must configure via group).
- `fileAccessAuth` on `/api/media/file`: device tokens verified against
  activation + configured-media membership (incl. schedule profiles,
  emergency media); user bearer verified via ownership. Redis-cached.

## Upload security

- Extension + canonical MIME allowlist (images/video/pdf only).
- Filename sanitized (`path.basename`); per-user session dirs with
  path-traversal guard.
- Chunked uploads: session TTL 24h, max 5 active sessions, max 1024 chunks,
  per-chunk SHA-256 (optional client), whole-file SHA-256 on complete,
  assembled-size check, per-user quotas (count/size/monthly).
- Device-targeted uploads require device assignment.

## Data protection

- `deleteMedia` blocked when file referenced by device configs, schedule
  profiles/templates, legacy `mediaUrls`.
- `Media.assignedDevices` kept complete (backfill + sync hooks).
- AuditLog TTL 90 days.
- Config history capped at 20/device (rollback without unbounded growth).

## Transport & edge

- CORS: explicit origin list + `FRONTEND_URL`.
- Rate limiting on all `/api` routes (env-configurable).
- `express.json` limit 1mb (measured safe).
- Nginx security headers (X-Frame-Options, nosniff, XSS); HTTPS via ACM/ALB.
- Secrets in Secrets Manager — never committed; `.env` gitignored.

## Known open items (see `docs/SECURITY_CHECKLIST.md`)

- Nginx `/uploads/` static location bypasses `fileAccessAuth` — remove before
  go-live.
- JWT rotation procedure + token revocation review.
- WAF + security groups at deploy.
- Socket.io single-node (scaling constraint, not a vuln).

## Rules for code changes

- Never weaken auth/permission checks to make a feature work.
- Never expose private media storage or hardcode secrets.
- New endpoints: add auth middleware + permission check + ownership/scope
  verification + a backend test.
- New media-serving paths: must go through `fileAccessAuth` equivalent.
