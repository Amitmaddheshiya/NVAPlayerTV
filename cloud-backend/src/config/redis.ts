import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  if (!redisClient) {
    redisClient = createClient({
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

    redisClient.on('error', (err) => {
      // Only log once on connection failure to avoid spam
      if (err.code === 'ECONNREFUSED') {
        console.warn('Redis not available - caching disabled (app will work without Redis)');
      } else {
        console.error('Redis Client Error:', err);
      }
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });

    redisClient.on('disconnect', () => {
      console.log('Redis Client Disconnected');
    });

    try {
      await redisClient.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      redisClient = null;
    }
  }

  return redisClient;
};

export const closeRedisClient = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

// Cache helper functions
export const cacheGet = async (key: string): Promise<string | null> => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    return await client.get(key);
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

export const cacheSet = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    await client.setEx(key, ttlSeconds, value);
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
};

export const cacheDel = async (key: string): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
};

export const cacheDelPattern = async (pattern: string): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
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
    return false;
  }
};
