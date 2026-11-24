# Database Migration Guide

MongoDB (Atlas recommended). All changes so far are **additive and backward
compatible** — no destructive migrations, no data rewrites required.

## Schema/index changes (auto-applied on backend restart)

Mongoose `autoIndex` creates these on startup. Verify after deploy:

```js
db.groups.getIndexes()        // expect multikey on `devices`
db.devices.getIndexes()       // expect {updatedAt:-1} and {assignedUserId:1,updatedAt:-1}
db.auditlogs.getIndexes()     // expect TTL index on `timestamp` (expireAfterSeconds ~7776000 = 90d)
```

If `autoIndex` is disabled in prod (`autoIndex: false`), create manually:

```js
db.groups.createIndex({ devices: 1 })
db.devices.createIndex({ updatedAt: -1 })
db.devices.createIndex({ assignedUserId: 1, updatedAt: -1 })
db.auditlogs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 })
```

## Data backfill (already executed on dev DB — run on production)

`scripts/backfill-assigned-devices.js` reconciles `Media.assignedDevices`
from `Device.config` (incl. schedule profiles + legacy `mediaUrls`).

- **Add-only** — never removes assignments; safe to re-run.
- Dev run: 40k devices scanned, 0 media refs → no writes.
- Production: `cd cloud-backend && node scripts/backfill-assigned-devices.js`
  (supports dry-run flag — check script header for usage).

## Collections overview

| Collection | Purpose | Notes |
|---|---|---|
| `users` | CMS accounts (owner/admin/sub-user) | `parentId` for sub-users, `resourceAccess` scoping |
| `devices` | TV devices, config, heartbeat state | `config` embeds schedule profiles (bounded 20) |
| `media` | Uploaded media metadata | `path`, `hash` (sha256), `assignedDevices` |
| `groups` | Device groups + shared config | `devices` array (multikey indexed) |
| `scheduletemplates` | Reusable schedule templates | referenced by device/group schedules |
| `auditlogs` | Admin/security audit trail | TTL 90d |
| `globalconfigs` | Singleton app config (limits, APK version) | |

## Rollback

- Indexes: dropping is safe (`dropIndex`) but not required — they only affect query plans.
- TTL index: documents older than 90d will be auto-deleted once it exists; this is intended.
- Backfill: add-only; no rollback needed. If `assignedDevices` must be rebuilt, delete the field and re-run.
- Full DB restore: see `ROLLBACK_AND_DISASTER_RECOVERY.md` (Atlas PITR/snapshot restore).

## Scaling notes

- Replica set (3 nodes) is sufficient for 40k devices. Sharding is a future
  evaluation only — do not shard without measured need.
- Watch `Device.config` document size if schedule profiles are adopted at scale
  (see PRODUCTION_PROGRESS #28).
