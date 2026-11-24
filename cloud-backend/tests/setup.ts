import mongoose from 'mongoose';
import http from 'http';
import { initializeSocket } from '../src/socket/socket';
import env from '../src/config/env';

// Redis is optional infrastructure — stub it so tests never touch a real server
// and cache misses always fall through to the database.
jest.mock('../src/config/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue(null),
  closeRedisClient: jest.fn().mockResolvedValue(undefined),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(true),
  cacheDel: jest.fn().mockResolvedValue(true),
  cacheDelPattern: jest.fn().mockResolvedValue(true),
}));

// Tests run against a dedicated database on the same MongoDB instance —
// never the development database. Derive the URI by swapping the db name.
const TEST_DB_NAME = 'signage_test';
const baseUri = env.MONGODB_URI;
const testUri = /\/[^/?]+(\?.*)?$/.test(baseUri)
  ? baseUri.replace(/\/[^/?]+(\?.*)?$/, `/${TEST_DB_NAME}$1`)
  : `${baseUri.replace(/\/$/, '')}/${TEST_DB_NAME}`;

beforeAll(async () => {
  await mongoose.connect(testUri);
  // Controllers call getSocketInstance() during config/group saves — give them
  // a real (unconnected) io instance so emits are safe no-ops.
  initializeSocket(http.createServer());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});
