# Socket.IO Multi-Node Readiness

Status: **single-node only today**. This doc records what must change before
running more than one backend instance behind a load balancer.

## Current state

- `cloud-backend/src/socket/socket.ts` creates one `SocketIOServer` per process.
- Rooms (`device:<id>`, `user:<id>`, `admin`) live in that process's memory.
- `pushConfigToDevice`, `pushDeviceHeartbeat`, `pushEmergency*` emit only to
  sockets connected to **the same node**.
- Auth middleware (`io.use`) verifies JWT/device token per handshake — fine
  multi-node, no shared state needed.
- Redis is already used for caching (`config/redis.ts`) — reuse it for the
  adapter.

## What breaks with N nodes

| Scenario | Symptom |
|---|---|
| Device socket lands on node A, CMS user on node B | `config:update` / `device:heartbeat` never reaches the other side |
| `revokeDeviceSockets` on node A | Device connected to node B keeps its socket |
| Sticky sessions absent | Socket handshake and polling requests hit different nodes → intermittent connect failures |

## Required changes (in order)

1. **Sticky sessions** at the load balancer (ALB: enable stickiness on the
   socket path, or use `transports: ['websocket']` only — polling requires
   stickiness, pure websocket does not).
2. **Redis adapter** — one line once `@socket.io/redis-adapter` is installed:

   ```ts
   import { createAdapter } from '@socket.io/redis-adapter';
   import { createClient } from 'redis';
   const pubClient = createClient({ url: env.REDIS_URL });
   const subClient = pubClient.duplicate();
   await Promise.all([pubClient.connect(), subClient.connect()]);
   io.adapter(createAdapter(pubClient, subClient));
   ```

   With the adapter, `io.to(room).emit(...)` fans out across all nodes —
   `pushDeviceHeartbeat` throttling (per-device Map in `socket.ts`) stays
   correct because emits still originate from one node per heartbeat.
3. **`revokeDeviceSockets`** — adapter makes `io.in(room).disconnectSockets()`
   work cluster-wide; verify after enabling.
4. **Heartbeat emit throttle state** (`heartbeatEmitState` Map) is per-node —
   acceptable: each device heartbeats to exactly one node, so each deviceId
   appears on one node only.

## Verification checklist

- [ ] 2 backend instances behind LB with sticky sessions
- [ ] Device connects to instance A, CMS to instance B → config push arrives
- [ ] `device:heartbeat` reaches admin room regardless of node
- [ ] `revokeDeviceSockets` disconnects a socket on the other node
- [ ] Socket reconnect after LB node restart works (client `reconnectionAttempts: Infinity` already set on APK)

## Not required

- No changes to APK or CMS clients — rooms/events are node-agnostic.
- No changes to REST API — already stateless (JWT + Redis cache).
