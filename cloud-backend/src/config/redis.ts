import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let redisConnecting: Promise<RedisClientType | null> | null = null;
// Circuit breaker: after a failed connect, skip Redis for this long so a
// down Redis doesn't add a connect attempt to every single request.
let redisCooldownUntil = 0;
const REDIS_COOLDOWN_MS = 30_000;

// In-memory cache layer — always active. Single-instance deployments need no
// Redis at all; when Redis IS reachable it acts as a shared second layer
// (useful once the backend scales beyond one node).
interface MemoryEntry { value: string; expiresAt: number }
const memoryCache = new Map<string, MemoryEntry>();
const MEMORY_CACHE_MAX = 5000;

const memoryGet = (key: string): string | null => {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
};

const memorySet = (key: string, value: string, ttlSeconds: number): void => {
  // Bound memory: evict expired entries first, then oldest (Map preserves
  // insertion order) once the cap is hit.
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of memoryCache) {
      if (now > v.expiresAt) memoryCache.delete(k);
    }
    while (memoryCache.size >= MEMORY_CACHE_MAX) {
      const oldest = memoryCache.keys().next().value;
      if (oldest === undefined) break;
      memoryCache.delete(oldest);
    }
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

const memoryDel = (key: string): void => {
  memoryCache.delete(key);
};

const globToRegex = (pattern: string): RegExp =>
  new RegExp('^' + pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

const memoryDelPattern = (pattern: string): void => {
  const regex = globToRegex(pattern);
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) memoryCache.delete(key);
  }
};

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  // Circuit breaker: don't hammer a down Redis on every request.
  if (Date.now() < redisCooldownUntil) return null;
  if (redisClient) return redisClient;
  if (redisConnecting) return redisConnecting;

  redisConnecting = (async () => {
    const client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis reconnection failed after 10 retries');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    client.on('error', (err) => {
      // Only log once on connection failure to avoid spam
      if (err.code === 'ECONNREFUSED') {
        console.warn('Redis not available - memory cache active (app will work without Redis)');
      } else {
        console.error('Redis Client Error:', err);
      }
    });

    client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    client.on('disconnect', () => {
      console.log('Redis Client Disconnected');
    });

    try {
      await client.connect();
      redisClient = client;
      redisCooldownUntil = 0;
      return client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      redisCooldownUntil = Date.now() + REDIS_COOLDOWN_MS;
      try { await client.quit(); } catch { /* ignore */ }
      return null;
    } finally {
      redisConnecting = null;
    }
  })();

  return redisConnecting;
};

export const closeRedisClient = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

// Cache helper functions — memory layer first, Redis as shared second layer.
export const cacheGet = async (key: string): Promise<string | null> => {
  const local = memoryGet(key);
  if (local !== null) return local;
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const value = await client.get(key);
    if (value !== null) {
      // Backfill memory so subsequent reads don't hit Redis.
      memorySet(key, value, 60);
    }
    return value;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

export const cacheSet = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
  memorySet(key, value, ttlSeconds);
  try {
    const client = await getRedisClient();
    if (!client) return true; // memory write succeeded
    await client.setEx(key, ttlSeconds, value);
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return true; // memory write already succeeded
  }
};

export const cacheDel = async (key: string): Promise<boolean> => {
  memoryDel(key);
  try {
    const client = await getRedisClient();
    if (!client) return true;
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return true;
  }
};

export const cacheDelPattern = async (pattern: string): Promise<boolean> => {
  memoryDelPattern(pattern);
  try {
    const client = await getRedisClient();
    if (!client) return true;
    let batch: string[] = [];
    for await (const scanned of client.scanIterator({ MATCH: pattern, COUNT: 500 })) {
      const keys = Array.isArray(scanned) ? scanned : [scanned];
      batch.push(...keys.map(String));
      if (batch.length >= 500) {
        await client.del(batch);
        batch = [];
      }
    }
    if (batch.length) await client.del(batch);
    return true;
  } catch (error) {
    console.error('Cache delete pattern error:', error);
    return true;
  }
};
