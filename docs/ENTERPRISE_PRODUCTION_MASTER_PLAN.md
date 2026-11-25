# Enterprise Production Master Plan

## Purpose

This document is the authoritative implementation brief for evolving this existing digital-signage project into a secure, scalable, multi-tenant production SaaS without breaking working LAN playback, Cloud playback, existing TV APKs, customer data, device activation, schedules, groups, media, alerts, or synchronization.

## Authorization and phase control

- Do not start production implementation merely because this document exists.
- Begin the requested work only when the user explicitly enters `PHASE 1`, `PHASE 2`, `PHASE 3`, `PHASE 4`, or `PHASE 5`.
- Do not automatically continue to the next phase.
- Before a phase, inspect the current Git branch and status, preserve all existing edits, and never use destructive Git operations.
- Before changing a feature, trace it across UI -> API -> backend -> database/cache -> Socket -> TV APK.
- Keep API contracts and stored data backward compatible. Any schema or API migration requires a compatibility and rollback plan.

## Target scale

Initial target: 10,000 users and 40,000 Android TV devices.

Future target: 100,000+ users and 1,000,000+ devices. Do not claim this capacity without executed load and reliability tests.

## Required audit before implementation

For the selected phase, inspect the relevant implementation across:

- `cloud-backend`, `cloud-frontend`, Android TV APK, LAN CMS, admin and user pages.
- MongoDB models, indexes, Redis use, authentication, authorization, device activation, media access, schedules, groups, heartbeats, sockets, emergency alerts, APK updates, Nginx, deployment files, environment handling, tests and CI/CD.
- Existing working functionality, incomplete/broken/duplicate paths, security risks, performance limits, compatibility risks and missing test coverage.

Use evidence from code and executed checks. Do not treat a filename or a successful compilation as proof that a feature works.

## Architecture direction

Use the existing project as the foundation and validate compatibility before adding infrastructure.

- AWS: EC2 Auto Scaling, ALB, multi-AZ design, S3, CloudFront, WAF, Route 53, ACM, Secrets Manager or Parameter Store, CloudWatch, SQS and DLQs. Evaluate ECS on EC2 only when it reduces operational risk.
- Database: MongoDB Atlas on AWS, replica sets, backups/PITR, tenant-scoped indexes, measured sharding evaluation.
- Redis/Valkey: cache, rate limiting, Socket.io cross-instance adapter, short-lived authorization data and distributed coordination.
- Media: private S3, CloudFront, signed authorization, multipart/resumable uploads, integrity checks, tenant isolation and lifecycle rules.
- Device communication: optimize Socket.io first; evaluate MQTT/AWS IoT only with an explicit compatibility, cost and migration analysis.

Never expose private media storage, hardcode secrets, weaken authentication, or replace working modules without a proven migration path.

## Current execution track

- Decision (2026-11-23): **fixes-first track (Option A)** — confirmed code bugs and
  security fixes are implemented before the full `PHASE 1` scope (S3/CloudFront,
  Socket.io Redis adapter, multi-instance). LAN-based features stay untouched.
- Live status of every fix item and master-phase mapping is tracked in
  `docs/PRODUCTION_PROGRESS.md` — read it before starting any work.
- The `PHASE 1`-`PHASE 5` commands below remain the authoritative gates; do not
  treat this note as authorization to start a phase.

## Phase 1 — critical architecture, security and storage

1. Implement and wire S3 private media storage, CloudFront, signed media access and unified storage paths.
2. Preserve and verify chunked/resumable uploads with APK and LAN compatibility.
3. Add Socket.io Redis adapter and multi-instance communication.
4. Review ALB/Nginx session behavior and load balancing.
5. Add required media path/url indexes and secure media authorization caching.
6. Remove public unauthenticated upload access only with a migration-compatible replacement.
7. Harden device activation, pairing/QR flows, device tokens, tenant/device-bound authorization and audit retention.
8. Verify all authentication, authorization, API resource isolation, LAN behavior and supported APK compatibility.

## Phase 2 — backend, database and scalability

1. Optimize heartbeat, Redis access, device status, dashboard/device/media queries and large playlist handling.
2. Add measured MongoDB indexes and bulk operations where safe.
3. Add queues, retries, DLQs and idempotency for suitable background work.
4. Add distributed rate limiting, connection/time-out/resource controls and multi-instance cache strategy.
5. Review Socket recovery, JWT lifecycle, device limits, schedule synchronization and duplicate command/job prevention.
6. Monitor document-size limits and remove dependence on single-process memory state.

## Phase 3 — frontend, tenancy and enterprise features

1. Ensure server-side pagination, search, filtering, sorting and complete loading/error/empty states.
2. Implement strict organization/tenant isolation, RBAC, sub-user resource permissions, quotas and cross-tenant protection across every API.
3. Implement complete end-to-end enterprise features only when scoped: proof of play, device reports, online history, audit view, bulk actions, diagnostics, alerts, webhooks, public API keys and analytics.

No frontend-only placeholder features are allowed.

## Phase 4 — QA, security and load testing

Execute and document functional tests for auth, permissions, activation, heartbeats, media uploads/downloads/playback, playlists, groups, schedules, alerts, commands, updates, LAN and Cloud.

Perform authorization/IDOR, token, file access, upload, WebSocket, secret and rate-limit security testing.

Use controlled load tests; report concurrency, RPS, average/P95/P99 latency, errors, CPU/RAM, MongoDB/Redis/network/media metrics. Never label any target as passed without executed evidence and never use destructive tests against customer data.

## Phase 5 — AWS production deployment

Prepare and document IAM, VPC/subnets, security groups, EC2/ECS decision, Auto Scaling, ALB, Nginx, DNS, TLS, S3/CloudFront, MongoDB Atlas, ElastiCache, SQS, secrets, Docker, CI/CD, migrations, health checks, monitoring, alarms, backups, restore, rolling/blue-green deploys, rollback, smoke tests, APK connectivity and cost monitoring.

Document multi-AZ availability, disaster recovery, horizontal scaling and no-downtime deployment design.

## Mandatory implementation rules

- Make minimal, compatible changes after tracing all callers and data paths.
- Do not delete working code to simplify work.
- Do not silently swallow errors, use placeholders, unsafe database operations, or unverified assumptions.
- Use validation, logging, idempotency/transactions where appropriate.
- Run focused relevant checks after changes; report checks that could not run and why.
- Never mark work verified without actual evidence.
- Do not build an APK unless explicitly requested.

## Documentation to maintain during authorized phases

Create and update these as work begins:

1. `docs/PRODUCTION_PROGRESS.md`
2. `docs/AWS_DEPLOYMENT_GUIDE.md`
3. `docs/DATABASE_MIGRATION_GUIDE.md`
4. `docs/SECURITY_CHECKLIST.md`
5. `docs/LOAD_TEST_REPORT.md`
6. `docs/ROLLBACK_AND_DISASTER_RECOVERY.md`
7. `docs/ENVIRONMENT_VARIABLES.md`
8. `docs/PRODUCTION_OPERATIONS_RUNBOOK.md`
9. `docs/SOCKET_SCALING.md`

Track each item as `NOT STARTED`, `IN PROGRESS`, `IMPLEMENTED`, `TESTED`, `VERIFIED`, or `BLOCKED`.

## Required phase completion report

For every authorized phase, report: completed work, changed files, dependencies, database changes/migrations, security and performance changes, executed tests and results, unresolved issues, required AWS/user configuration, rollback instructions, readiness status and the next phase command.
