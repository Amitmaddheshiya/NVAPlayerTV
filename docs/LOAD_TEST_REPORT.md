# Load Test Report

Harness: `cloud-backend/scripts/load-test.js` (`npm run load-test`).

## What it simulates

- **Heartbeat phase**: N activated devices POST `/api/devices/:id/heartbeat`
  with steady-state `configVersion` (no config payload — same as production
  steady state). Real device JWTs minted per device.
- **Media phase**: ranged GET `/api/media/file/<path>?deviceToken=...` with
  `Range: bytes=0-1MB` — identical to Android player behavior (206 partial).

## Usage

```bash
cd cloud-backend
npm run load-test -- --seed 500 --devices 500 --concurrency 100 --duration 60 --phase both
npm run load-test -- --cleanup   # remove lt-dev-* devices + test media
```

Flags: `--seed N` (create N devices + 8MB media), `--devices N`,
`--concurrency N` (parallel workers), `--duration SEC`, `--phase heartbeat|media|both`.

## Baseline (dev machine, ts-node dev server — NOT production numbers)

| Phase | Concurrency | Devices | Duration | Throughput | p50 latency | Notes |
|---|---|---|---|---|---|---|
| heartbeat | 20 | 50 | 10s | ~80 req/s | 235ms | ts-node, no Redis |
| media (1MB ranges) | 20 | 50 | 10s | ~14.5 req/s (~14MB/s) | 1.37s | local disk, dev server |

## Production run (TODO before go-live)

Run against compiled backend (`npm run build && npm start`) on a prod-like
instance, then against staging ASG. Record:

### Executed run — 2026-11-24 (dev machine, localhost:3000)

500 seeded devices (`lt-dev-*`), 100 workers, 60s per phase, `phase=both`.

| Phase | Requests | Throughput | Errors | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|
| heartbeat | 8332 | 138.9 req/s | 0 (0.00%) | 687ms | 1122ms | 1515ms | 3023ms |
| media (1MB ranges) | 1481 | 24.7 req/s (~25MB/s) | 6 (0.41%) | 4341ms | 5060ms | 5611ms | 6837ms |

Status codes: heartbeat 100% `200`; media 1475×`206` + 6 errors.

**Reading**: heartbeat scales fine at 500 devices / 100 concurrent. Media
throughput (~25MB/s, p50 4.3s per 1MB range) is the bottleneck — expected on
dev hardware with `express.static` on local disk; re-measure on prod-like
instance and after S3/CloudFront. The 6 media errors (0.41%) should be
investigated if they reproduce on staging (likely connection resets under
concurrency, not app errors — all completed requests returned 206).

- [ ] Heartbeat req/s at 1k / 5k / 10k devices
- [ ] Media ranged-GET throughput (MB/s) at concurrent viewers
- [ ] p50/p95/p99 latency, error rate
- [ ] CPU/RAM of backend, MongoDB ops/sec, Redis hit rate, network egress
- [ ] Socket.io connection count stability

Target capacity claim (10k users / 40k devices) requires executed evidence —
per master plan, do not claim without it.

## Known bottlenecks to watch

- `pushDeviceHeartbeat` socket emits — throttled (1/60s per device) but 40k
  devices still = ~667 emits/min worst case; verify socket fan-out cost.
- Media file serving is `express.static` on local disk — single-node disk
  throughput is the ceiling until S3/CloudFront.
- `fileAccessAuth` per-request DB lookups — Redis-cached; verify hit rate under load.
