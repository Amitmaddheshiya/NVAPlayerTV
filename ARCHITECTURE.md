# Architecture

## Overview

Three deployables + two data stores:

```
┌─────────────┐   HTTPS/WS    ┌──────────────────┐   Mongoose   ┌────────────┐
│  TV APK     │ ◄───────────► │  cloud-backend   │ ◄──────────► │  MongoDB   │
│ (React      │  heartbeat,   │  (Express+Socket)│              │ (Atlas)    │
│  Native TV) │  config,      │                  │   cacheGet/  ├────────────┤
└─────────────┘  media files  │                  │   Set/Del    │  Redis     │
      ▲                       └────────┬─────────┘              │ (cache,    │
      │                                │                        │  rate-limit│
      │                                ▼                        │  future    │
┌─────┴──────┐                 ┌──────────────┐                 │  socket    │
│ cloud-     │   REST + WS     │  uploads/    │                 │  adapter)  │
│ frontend   │ ◄──────────────►│  (local disk │                 └────────────┘
│ (React CMS)│                 │  or S3 later)│
└────────────┘                 └──────────────┘
```

## TV APK (`src/`, `android/`)

- **React Native 0.83 / React 19 / TypeScript** player app for Android TV.
- Two modes: **LAN mode** (TV-hosted embedded CMS via `EmbeddedCmsServer.java`,
  QR access, USB playback) and **Cloud mode** (activated device talking to
  cloud-backend).
- Cloud pipeline (`src/services/cloudService.ts`): device registration,
  device-token auth (1h JWT, auto-refresh), heartbeat every interval with
  `configVersion`, config fetch, emergency alerts, playback-error reports,
  APK update checks.
- Config apply pipeline (`src/app/App.tsx` `config:update` handler): stages
  incoming config into a **new cache generation**, prefetches media
  (`mediaService.prefetchMediaItems`), verifies size/hash
  (`verifyCachedMediaItems`), and only then commits config + generation.
  Previous playlist keeps playing until verification succeeds.
- Media cache (`src/services/mediaService.ts`): per-mode directories
  (LAN/Cloud), manifest JSON with size/mtime/SHA-256, temp-download +
  atomic move, deduped in-flight downloads, adaptive concurrency, low-space
  preflight, generation pruning.
- Schedule resolution (`src/services/scheduleService.ts`): time/date/priority
  based profile selection, overnight rules, conflict detection.
- Socket.io client for instant `config:update`, commands, emergency alerts;
  heartbeat is the fallback convergence path.

## Cloud backend (`cloud-backend/`)

- **Express + TypeScript**, entry `src/index.ts` (socket init, DB connect,
  listen, background jobs); `src/app.ts` is the Express app without listen
  (used by tests).
- **Routes**: `/api/auth`, `/api/devices`, `/api/media`, `/api/schedules`,
  `/api/groups`, `/api/users`, `/api/config` — see `API.md`.
- **Middleware**: `auth` (user JWT), `deviceAuth` (device JWT), `adminOnly`,
  `requirePermission`, `fileAccessAuth` (media file auth), `rateLimit`.
- **Socket.io**: device rooms (`device:<id>`), `config:update` push on config
  save, heartbeat events, emergency alerts. **Single-node only** — no Redis
  adapter yet (see `docs/SOCKET_SCALING.md`).
- **Storage**: `STORAGE_TYPE=local` (default, `uploads/`) or `s3` (stub).
  Chunked uploads staged under `uploads/temp/chunked/<userId>/`.
- **Config processing** (`src/utils/configProcessor.ts`): validates media
  ownership/existence, converts to absolute URLs, builds per-section
  `mediaItems` metadata (size/hash/mtimeMs) for TV cache verification.
- **Background jobs**: upload-session cleanup, index `autoIndex` on boot.

## Cloud CMS (`cloud-frontend/`)

- **React + Vite + TypeScript**, TanStack Query for server state, Axios
  client (`src/services/api.ts`, 60s timeout, chunked upload with per-chunk
  + whole-file SHA-256 via `src/utils/sha256.ts`).
- Pages: Dashboard, Devices, Device detail (config editor), Groups, Library,
  Schedules, Users, admin pages. Real server-side pagination on lists.
- Socket.io client for live device heartbeat/config updates; auth token read
  fresh on every (re)connect.

## Data stores

- **MongoDB** (Mongoose): users, devices, media, groups, schedule templates,
  audit logs, global config — see `DATABASE.md`.
- **Redis** (optional but recommended): device-list summary cache (30s),
  media-auth cache, rate-limit backing, future socket adapter. App degrades
  gracefully without it.
- **Local disk / S3**: media binaries. `Media.path` is storage-relative;
  `Media.url` is absolute (`SERVER_URL` at upload time).

## Key flows

### Config push (CMS → TV)

1. CMS `POST /api/devices/:id/config` (or group configure).
2. Backend `processConfigForStorage` → save `device.config`,
   `cacheInfo.configVersion++`, socket `config:update` to device room.
3. TV receives via socket (or next heartbeat if offline) → stages config,
   downloads media to new generation, verifies, commits, reports
   `sync-status` (`pending`/`ready`/`failed`).

### Media upload (CMS → backend)

- Small files: `POST /api/media/upload` (multer, allowlist, sha256).
- Large files (>32MB): chunked session — init → PUT chunks (per-chunk hash)
  → complete (assembled-size + optional whole-file hash verify) → media doc.

### Media playback (TV → backend)

- `GET /api/media/file/<path>?deviceToken=...` with `Range` header → 206
  partial content. `fileAccessAuth` verifies device activation + that the
  file is in the device's configured media (incl. schedule profiles,
  emergency media); Redis-cached.

## Scaling constraints (current)

- Socket.io single-node → run **one** backend instance until Redis adapter
  + sticky sessions land (`docs/SOCKET_SCALING.md`).
- Media served from local disk → single-node disk throughput ceiling until
  S3/CloudFront.
- PM2 `ecosystem.config.js` defaults to cluster `max` — override to 1
  instance for production until socket adapter exists.
