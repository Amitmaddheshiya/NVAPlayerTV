import { api, createUser, loginAs, authHeader } from './helpers';
import User from '../src/models/User';
import Media from '../src/models/Media';
import GlobalConfig from '../src/models/GlobalConfig';
import { checkUploadQuota, recordUpload, checkAssignQuota, recordAssign, checkDeviceLimit } from '../src/utils/quota';

const GB = 1024 * 1024 * 1024;

const setConfig = async (overrides: any = {}) => {
  const config = await (GlobalConfig as any).getConfig();
  Object.assign(config, overrides);
  await config.save();
  return config;
};

describe('Quota utils — upload', () => {
  it('allows upload within storage + ops limits', async () => {
    const { user } = await createUser();
    await setConfig({ storageLimitGB: 1, monthlyUploadOpsLimit: 10, monthlyUploadLimitGB: 10 });
    const res = await checkUploadQuota(user._id.toString(), 100 * 1024 * 1024);
    expect(res.ok).toBe(true);
  });

  it('rejects when storage quota would be exceeded', async () => {
    const { user } = await createUser({ storageUsed: 900 * 1024 * 1024 });
    await setConfig({ storageLimitGB: 1 });
    const res = await checkUploadQuota(user._id.toString(), 200 * 1024 * 1024);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Storage limit exceeded/);
  });

  it('rejects when monthly upload ops limit reached', async () => {
    const { user } = await createUser({ monthlyUploadOps: 10, uploadUsageMonth: new Date().toISOString().slice(0, 7) });
    await setConfig({ monthlyUploadOpsLimit: 10, storageLimitGB: 5 });
    const res = await checkUploadQuota(user._id.toString(), 1024);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
  });

  it('recordUpload increments storage, bytes and ops counters', async () => {
    const { user } = await createUser();
    await recordUpload(user._id.toString(), 5000);
    const after = await User.findById(user._id);
    expect(after?.storageUsed).toBe(5000);
    expect(after?.currentMonthUpload).toBe(5000);
    expect(after?.monthlyUploadOps).toBe(1);
  });

  it('monthly counters reset when usage month rolls over', async () => {
    const { user } = await createUser({
      uploadUsageMonth: '2000-01',
      currentMonthUpload: 999,
      monthlyUploadOps: 9,
      monthlyAssignOps: 14,
    });
    const res = await checkUploadQuota(user._id.toString(), 1024);
    expect(res.ok).toBe(true);
    const after = await User.findById(user._id);
    expect(after?.monthlyUploadOps).toBe(0);
    expect(after?.monthlyAssignOps).toBe(0);
    expect(after?.currentMonthUpload).toBe(0);
  });
});

describe('Quota utils — assignment', () => {
  it('checkAssignQuota blocks at limit and recordAssign increments', async () => {
    const { user } = await createUser({ monthlyAssignOps: 15, uploadUsageMonth: new Date().toISOString().slice(0, 7) });
    await setConfig({ monthlyAssignOpsLimit: 15 });
    const blocked = await checkAssignQuota(user._id.toString());
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe(429);

    const { user: user2 } = await createUser();
    await recordAssign(user2._id.toString());
    const after = await User.findById(user2._id);
    expect(after?.monthlyAssignOps).toBe(1);
  });
});

describe('Quota utils — device limit', () => {
  it('checkDeviceLimit counts assigned devices and enforces maxDevicesPerUser', async () => {
    const { user } = await createUser();
    await setConfig({ maxDevicesPerUser: 2 });
    // No devices yet — adding 2 is fine, adding 3 is not.
    const ok = await checkDeviceLimit(user._id.toString(), 2);
    expect(ok.ok).toBe(true);
    expect(ok.limit).toBe(2);
    const over = await checkDeviceLimit(user._id.toString(), 3);
    expect(over.ok).toBe(false);
  });
});

describe('GET /api/users/me — usage object', () => {
  it('returns usage quotas for the authenticated user', async () => {
    const { user, password } = await createUser();
    await setConfig({ storageLimitGB: 1, monthlyUploadOpsLimit: 10, monthlyAssignOpsLimit: 15, maxDevicesPerUser: 4, singleUploadLimitMB: 500 });
    const token = await loginAs(user.email, password);
    const res = await api().get('/api/users/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.usage).toBeDefined();
    expect(res.body.usage.storage.limitGB).toBe(1);
    expect(res.body.usage.uploadOps.limit).toBe(10);
    expect(res.body.usage.assignOps.limit).toBe(15);
    expect(res.body.usage.devices.limit).toBe(4);
    expect(res.body.usage.fileSizeLimitMB).toBe(500);
  });
});

describe('POST /api/media/:id/assign — assignment quota', () => {
  it('returns 429 when monthly assignment limit is reached', async () => {
    const { user, password } = await createUser({ monthlyAssignOps: 15, uploadUsageMonth: new Date().toISOString().slice(0, 7) });
    await setConfig({ monthlyAssignOpsLimit: 15 });
    const media = await Media.create({
      filename: 'a.mp4', originalName: 'a.mp4', mimeType: 'video/mp4',
      size: 100, url: 'http://localhost:3000/api/media/file/uploads/a.mp4',
      path: 'uploads/a.mp4', section: 1, uploadedBy: user._id,
    });
    const token = await loginAs(user.email, password);
    const res = await api().post(`/api/media/${media._id}/assign`).set(authHeader(token)).send({ deviceIds: [] });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/assignment limit/i);
  });
});
