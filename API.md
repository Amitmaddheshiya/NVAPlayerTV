# API Reference — cloud-backend

Base URL: `SERVER_URL` (e.g. `http://192.168.1.3:3000`). All routes under
`/api` unless noted. Auth: `Authorization: Bearer <jwt>`.

## Auth types

- **User JWT** — CMS login (`/api/auth/login`); carries `userId`, `role`
  (`admin`/`user`), permissions, resourceAccess.
- **Device JWT** — issued at activation/refresh; `deviceAuth` middleware;
  1h TTL, auto-refreshed by APK.
- **Media file auth** — `/api/media/file/*` accepts user bearer OR
  `?deviceToken=` query param (for Range-capable players).

## Endpoints

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | rate-limited | Create account (cannot self-grant admin) |
| POST | `/login` | rate-limited | Login → JWT |

### Devices — `/api/devices`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | user | Device stats |
| GET | `/` | user + `devices` perm | Paginated device list (non-admin: assigned only) |
| GET | `/:id` | user + perm | Device detail (sub-user scope checked) |
| GET | `/:id/media` | user + perm | Device media list |
| GET | `/:id/config-history` | user + perm | Config rollback history |
| GET | `/:id/activation` | public | Check activation status |
| GET | `/:id/cloud-config` | device | Device-facing config fetch |
| POST | `/` | user | Create/register device |
| POST | `/:id/heartbeat` | device | Heartbeat → returns configVersion, emergencyAlert, config if stale |
| POST | `/:id/health` | device | Health report |
| POST | `/:id/sync-status` | device | Config apply status (pending/ready/failed + media counts) |
| POST | `/:id/config` | user + perm | Save device config (processConfigForStorage → socket push) |
| POST | `/:id/emergency` | user + perm | Trigger emergency alert |
| POST | `/:id/emergency/clear` | user + perm | Clear emergency alert |
| POST | `/:id/retry-cloud-sync` | user + perm | Force cloud sync |
| POST | `/:id/command` | user + perm | Send command (restart/sync/clear-cache) |
| PUT | `/:id` | admin | Update device |
| DELETE | `/:id` | admin | Delete device |

### Media — `/api/media`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/upload` | user + `library` | Single-file upload (multer, allowlist, sha256) |
| POST | `/uploads/init` | user + `library` | Init chunked upload session |
| GET | `/uploads/:uploadId` | user + `library` | Chunked upload status |
| DELETE | `/uploads/:uploadId` | user + `library` | Cancel session |
| PUT | `/uploads/:uploadId/chunks/:index` | user + `library` | Upload chunk (per-chunk sha256) |
| POST | `/uploads/:uploadId/complete` | user + `library` | Complete (size + whole-file hash verify) |
| GET | `/stats` | admin | Media stats |
| GET | `/` | user + `library` | Paginated media list |
| GET | `/folders` | user + `library` | Folder list |
| GET | `/media-list` | device | Device-facing media list |
| DELETE | `/:id` | user + `library` | Delete (blocked if in-use) |
| POST | `/:id/assign` | user + `library` | Assign media to devices (counts 1 assign op) |
| PUT | `/:id` | user + `library` | Update media metadata |
| GET | `/file/<path>` | fileAccessAuth | Stream media file (Range → 206) |

### Groups — `/api/groups`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | user + `groups` | Group list |
| GET | `/:id` | user + `groups` | Single group (canAccessGroup) |
| POST | `/` | user + `groups` | Create group |
| PUT | `/:id` | user + `groups` | Update group |
| DELETE | `/:id` | user + `groups` | Delete group |
| POST | `/:id/configure` | user + `groups` | Apply config to all group devices (counts 1 assign op) |
| GET | `/:id/config-history` | user + `groups` | Config history |
| POST | `/:id/emergency` | user + `groups` | Group emergency alert |
| POST | `/:id/emergency/clear` | user + `groups` | Clear group emergency |

### Schedules — `/api/schedules`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | user | List schedule templates (target-scoped) |
| POST | `/` | user | Create template |
| PUT | `/:id` | user | Update template |
| DELETE | `/:id` | user | Delete template |

### Users — `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | user | Own profile + `usage` quota object (see below) |
| PUT | `/me` | user + `settings` | Update profile |
| POST | `/me/change-password` | user + `settings` | Change password |
| GET | `/me/sub-users` | user | List sub-users |
| POST | `/me/sub-users` | user | Create sub-user |
| PUT | `/me/sub-users/:id` | user | Update sub-user |
| DELETE | `/me/sub-users/:id` | user | Delete sub-user |
| GET | `/` | admin | All users |
| GET | `/:id` | admin | User detail |
| GET | `/:id/stats` | admin | User stats |
| POST | `/` | admin | Create user |
| PUT | `/:id` | admin | Update user |
| DELETE | `/:id` | admin | Delete user |
| POST | `/:id/devices` | admin | Assign devices |

### Global config — `/api/config`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/public` | public | Basic limits (no auth) |
| GET | `/` | admin | Full config |
| PUT | `/` | admin | Update config (APK version, quota limits) |

## Quotas & usage

Per-account limits (defaults, admin-tunable via `PUT /api/config`):

| Limit | Default | Scope |
|---|---|---|
| `storageLimitGB` | 1 GB | library storage per user |
| `singleUploadLimitMB` | 500 MB | max single file |
| `monthlyUploadLimitGB` | 10 GB | upload bytes/month |
| `monthlyUploadOpsLimit` | 10 | uploads/month (1 file = 1 op) |
| `monthlyAssignOpsLimit` | 15 | assign/configure calls/month |
| `maxDevicesPerUser` | 4 | TVs per account |
| `archivedMediaRetentionDays` | 30 | archived media purge window |

`GET /api/users/me` returns a `usage` object:

```json
{
  "usage": {
    "storage":        { "usedBytes": 0, "limitBytes": 1073741824, "limitGB": 1 },
    "monthlyUpload":  { "usedBytes": 0, "limitBytes": 10737418240, "limitGB": 10 },
    "uploadOps":      { "used": 0, "limit": 10 },
    "assignOps":      { "used": 0, "limit": 15 },
    "devices":        { "used": 0, "limit": 4 },
    "fileSizeLimitMB": 500,
    "resetsAt": "month-start"
  }
}
```

Quota breach responses: `400` for storage/file-size limits, `429` for
monthly ops limits — body `{ error: "<human-readable message>" }` which the
CMS surfaces as an alert dialog. Admin uploads/assignments are unmetered.
Monthly counters (`uploadUsageMonth` = `YYYY-MM`) reset lazily on first
request of the new month. Archived media (`deletedFromLibrary`) is purged
after `archivedMediaRetentionDays` by a daily job — only when no device
config or schedule template still references it.

### Misc
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | public | Health check |

## Conventions

- Errors: `{ error: string }` with 4xx/5xx status.
- Pagination: `?page=&limit=` → `{ data, total, page, ... }`.
- Config payloads: sections-based (`contentType`: multimedia/web/youtube),
  processed server-side into stored shape (absolute URLs + mediaItems).
- Rate limit: global `/api` limiter (env-configurable; off in development).
