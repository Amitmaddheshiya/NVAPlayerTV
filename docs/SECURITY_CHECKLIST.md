# Security Checklist

Status as of fixes-first track completion. Verify each item at deploy time.

## Authentication & authorization

- [x] JWT required for all `/api` routes except `/health`, `/api/auth/*`, `/api/config`
- [x] Device endpoints use `deviceAuth` (device JWT); user endpoints use `auth`
- [x] `adminOnly`/`userOrAdmin` role checks on admin routes
- [x] Sub-user `resourceAccess` scoping on devices/groups/schedules/media (tested)
- [x] Device activation flow issues short-lived device tokens (`ensureDeviceAuthToken`, 1h TTL, refresh on expiry)
- [x] Deactivated/unregistered devices get 404 → APK shows activation screen
- [x] Passwords bcrypt-hashed (cost 10 user auth, 12 test admin)
- [x] Public signup cannot grant admin role
- [ ] JWT secret rotation procedure documented (see RUNBOOK)
- [ ] Token revocation on password change / device unassign (verify behavior)

## Media file access

- [x] `/api/media/file` behind `fileAccessAuth` — no public static media
- [x] Device access verified against configured media (incl. schedule profiles, emergency)
- [x] User access verified via media ownership
- [x] Range requests supported (206) for video seeking
- [x] Media auth lookups Redis-cached with invalidation on config change
- [ ] **Nginx `/uploads/` location must be removed** — it bypasses `fileAccessAuth`
- [ ] Confirm no other static path exposes `uploads/`

## Upload security

- [x] Extension + canonical MIME allowlist (images/video/pdf only)
- [x] Filename sanitized (`path.basename`, no `/` or `\`)
- [x] Per-user session directories with path-traversal guard (`getSessionDirectory`)
- [x] Upload session TTL 24h, max 5 active sessions, max 1024 chunks
- [x] Per-chunk SHA-256 verification (client-supplied, optional)
- [x] Whole-file SHA-256 verification on complete (chunked uploads >32MB)
- [x] Assembled size must equal declared size
- [x] Single-file + monthly upload quotas enforced
- [x] Device-targeted uploads require device assignment to the user
- [x] Chunked temp files cleaned on complete/cancel/expiry

## API & transport

- [x] Rate limiting on all `/api` routes (env-configurable; off in development)
- [x] `express.json` limit 1mb (measured safe)
- [x] CORS restricted to explicit origins + `FRONTEND_URL`
- [x] Security headers in nginx (X-Frame-Options, nosniff, XSS)
- [x] HTTPS via ACM/ALB at deploy (nginx SSL block provided, commented)
- [ ] WAF rules on ALB/CloudFront (deploy step)
- [ ] Security groups: only 80/443 inbound; backend port not public

## Data protection

- [x] Media delete blocked when referenced (device config, schedule profiles/templates, legacy URLs)
- [x] `assignedDevices` kept complete via backfill + sync hooks
- [x] AuditLog TTL 90 days
- [ ] MongoDB Atlas encryption at rest + IP allowlist
- [ ] Backups/PITR enabled (see DR doc)
- [ ] No secrets in repo — verify `git log` / `.env` not committed

## Secrets & config

- [x] `JWT_SECRET` mandatory in production (app refuses to start without it)
- [x] AWS keys optional (IAM role preferred for S3)
- [ ] All secrets in Secrets Manager/Parameter Store, not `.env` on disk
- [ ] `TEST_ADMIN_*` unset in production
- [ ] CORS dev origins acceptable? (built-in localhost entries remain — low risk, env-driven `FRONTEND_URL` is the real gate)

## Known open items

1. Nginx `/uploads/` bypass — **fix before go-live**.
2. Socket.io single-node — not a vuln, but a scaling constraint (see SOCKET_SCALING.md).
3. JWT rotation / token revocation review.
4. WAF + security groups at deploy.
