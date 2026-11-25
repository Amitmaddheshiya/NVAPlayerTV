# Database — MongoDB

Mongoose models in `cloud-backend/src/models/`. Atlas replica set recommended
for production; `autoIndex` creates indexes on boot.

## Collections

### `users`
CMS accounts. Roles: `admin`, `user` (owner), sub-users (`parentId` → owner,
`resourceAccess` scoping devices/groups/media/schedules).
Key fields: `email`, `password` (bcrypt), `role`, `parentId`,
`resourceAccess`, `permissions`.

Quota/usage fields (enforced by `src/utils/quota.ts`, limits live in
`globalconfigs`). NOTE: the legacy `monthlyUploadLimit` field was removed —
the effective limit always comes from `globalconfigs.monthlyUploadLimitGB`:
- `storageUsed` — bytes currently stored in the user's library
- `currentMonthUpload` — bytes uploaded in the current usage month
- `uploadUsageMonth` — `YYYY-MM` marker; counters reset lazily when it rolls
- `monthlyUploadOps` — upload operations this month (1 file = 1 op)
- `monthlyAssignOps` — assignment operations this month (1 assign/configure
  API call = 1 op, regardless of device count)

### `devices`
TV devices. Key fields:
- `deviceId` — unique device identifier (used in URLs/rooms)
- `assignedUserId` — owning CMS user
- `config` — full player config (sections, layout, ticker, widgets, schedule
  profiles embedded — bounded at 20/device)
- `configHistory` — last 2 configs (rollback)
- `cacheInfo` — `configVersion`, `lastSyncTime`, `cachedMedia`,
  `totalCacheSize`
- `health` — heartbeat state, `cloudSync` status (pending/ready/failed,
  media counts, storage bytes)
- `status`, `lastSeen`, `appVersion`, `storage`, `location`,
  `emergencyAlert`, `activation` fields

Indexes: `{updatedAt:-1}`, `{assignedUserId:1,updatedAt:-1}`,
`Group.devices` multikey (see groups).

### `media`
Uploaded media metadata. Key fields: `filename`, `originalName`, `path`
(storage-relative), `url` (absolute, `SERVER_URL` at upload), `mimeType`,
`size`, `hash` (SHA-256), `folder`, `assignedDevices[]`, `uploadedBy`.

### `groups`
Device groups with shared config. Key fields: `name`, `devices[]` (deviceIds),
`config`, `configHistory`, `ownerId`/`assignedUserId`.
Index: multikey on `devices` (batch schedule sync depends on it).

### `scheduletemplates`
Reusable schedule templates. Key fields: `name`, `targetType`
(device/group), `targetId`, `schedules[]` (mode, days/dates, times,
priority, config snapshot), `ownerId`.

### `auditlogs`
Admin/security audit trail. TTL index on `timestamp` — **90 days**
auto-delete. `action` values: `upload_media`, `delete_media`,
`configure_device`, `assign_device`, `unassign_device`, `delete_device`,
`create_user`, `update_user` (role changes log `previousRole`/`newRole`),
`delete_user`, `create_group`, `update_group`, `delete_group`.

### `globalconfigs`
Singleton app config: upload limits, APK version/url, feature flags.
Quota fields (all admin-tunable via `PUT /api/config`):
- `storageLimitGB` — per-user library cap (default 1)
- `singleUploadLimitMB` — max single file size (default 500)
- `monthlyUploadLimitGB` — per-user monthly upload bytes (default 10)
- `monthlyUploadOpsLimit` — uploads per month per user (default 10)
- `monthlyAssignOpsLimit` — assign/configure ops per month (default 15)
- `maxDevicesPerUser` — TVs per account (default 4)
- `archivedMediaRetentionDays` — days before archived media is purged
  (default 30; in-use files are never purged)

## Indexes (auto-created on backend restart)

| Collection | Index | Purpose |
|---|---|---|
| `groups` | `{devices: 1}` multikey | batch schedule sync, group device lookup |
| `devices` | `{updatedAt: -1}` | device list sorting |
| `devices` | `{assignedUserId: 1, updatedAt: -1}` | non-admin device lists |
| `auditlogs` | `{timestamp: 1}` TTL 90d | retention |

Verify after deploy:

```js
db.groups.getIndexes(); db.devices.getIndexes(); db.auditlogs.getIndexes();
```

## Relationships

- `devices.assignedUserId` → `users._id`
- `users.parentId` → `users._id` (sub-users)
- `groups.devices[]` → `devices.deviceId`
- `media.assignedDevices[]` → `devices.deviceId` (derived from configs;
  kept complete by `backfill-assigned-devices.js` + sync hooks)
- `scheduletemplates.targetId` → device/group

## Data scripts (`cloud-backend/scripts/`)

- `backfill-assigned-devices.js` — add-only reconcile of
  `Media.assignedDevices` from `Device.config` (incl. schedule profiles).
- `fix-media-url-hosts.js` — rewrite stale media URL origins to current
  `SERVER_URL` (`--dry-run` supported).
- `analyze-config-size.js` — measure `Device.config` storage amplification.
- `check-config-sizes.js` — config size distribution.
- `load-test.js` — seed/load harness (`--seed/--devices/--cleanup`).

See `docs/DATABASE_MIGRATION_GUIDE.md` for migration/rollback details.
