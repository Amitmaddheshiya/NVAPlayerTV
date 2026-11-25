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

### Executed run — 2026-11-24 (dev machine, localhost:3000, ts-node dev)

500 seeded devices (`lt-dev-*`), 100 workers, 60s per phase, `phase=both`.

| Phase | Requests | Throughput | Errors | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|
| heartbeat | 8332 | 138.9 req/s | 0 (0.00%) | 687ms | 1122ms | 1515ms | 3023ms |
| media (1MB ranges) | 1481 | 24.7 req/s (~25MB/s) | 6 (0.41%) | 4341ms | 5060ms | 5611ms | 6837ms |

### Executed run — 2026-11-25 (dev machine, localhost:3000, **compiled `npm start`**)

500 seeded devices, 100 workers, 60s per phase, `phase=both`.

| Phase | Requests | Throughput | Errors | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|
| heartbeat | 9817 | 163.6 req/s | 0 (0.00%) | 583ms | 861ms | 1127ms | 2185ms |
| media (1MB ranges) | 1467 | 24.4 req/s (~24MB/s) | 0 (0.00%) | 4370ms | 4862ms | 5291ms | 5666ms |

Status codes: heartbeat 100% `200`; media 100% `206`.

**Reading**: compiled build is faster than ts-node dev (heartbeat +18%,
zero errors vs 6 transient errors before). Media ~24MB/s is `express.static`
on local disk — **in production this path becomes a 302 redirect to
CloudFront**, so EC2 never serves media bytes; the media-phase bottleneck
disappears. Heartbeat 163 req/s on a dev laptop ⇒ 40 devices heartbeating
every ~60s needs <1 req/s — enormous headroom; t3.small is sufficient for
the locked setup (20 users / 40 devices). Re-run on the actual EC2 instance
post-deploy to confirm.

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
