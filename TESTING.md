# Testing

## Test suites

### Backend API — `cloud-backend`

```bash
cd cloud-backend
npm test          # Jest + ts-jest + supertest, 36 tests / 6 suites
```

Runs against dedicated `signage_test` DB (same Mongo instance, collections
wiped per test); Redis mocked. Covers: auth register/login, device ownership,
group access (incl. sub-user resourceAccess), schedule sub-user enforcement,
media-delete in-use protection, quota enforcement (storage/upload-ops/
assign-ops/device-limit, `tests/quota.test.ts`).

Note: `Jest did not exit...` warning is benign (open Mongo handle) — tests
still pass.

### APK unit tests — repo root

```bash
npx jest           # all suites
npx jest src/services/cloudService.test.ts   # cloud pipeline only (18 tests)
```

Covers: cloudService (token cache/refresh/deactivate, heartbeat
configVersion semantics, config:update events, emergency alerts, 404
handling, playback-error bounds, downloadMedia), scheduleService
(resolveScheduledConfig, conflicts), cloudMediaUrl, slideRendererUtils,
videoPlaybackState.

### Type checks

```bash
cd cloud-backend && npm run build    # tsc
cd cloud-frontend && npx tsc -b
```

## Load testing

```bash
cd cloud-backend
npm run load-test -- --seed 500 --devices 500 --concurrency 100 --duration 60 --phase both
npm run load-test -- --cleanup
```

Simulates device heartbeats + ranged media GETs (same as Android player).
Latest results in `docs/LOAD_TEST_REPORT.md`.

## Manual / smoke verification

Post-deploy checklist (see `DEPLOYMENT.md`):

- [ ] `/health` returns ok
- [ ] CMS login + dashboard
- [ ] Device activation → heartbeat → config push (socket + heartbeat paths)
- [ ] >32MB chunked upload (exercises whole-file hash; corrupt → 400)
- [ ] Media playback on TV → 206 ranged requests
- [ ] Emergency alert → device receives + clears
- [ ] Quota: upload beyond 1GB storage → 400; 11th upload → 429;
      16th assign → 429; 5th device → 400; dashboard shows usage card
- [ ] LAN mode unaffected (embedded CMS, USB, QR)

## Regression rules

- New backend endpoint → add auth + permission + ownership check + test.
- Config pipeline changes → run `cloudService.test.ts` + backend tests.
- Media-serving changes → verify `fileAccessAuth` path + ranged GET.
- Never delete/weaken existing tests without explicit direction.
