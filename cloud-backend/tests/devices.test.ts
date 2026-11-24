import { api, createUser, loginAs, authHeader } from './helpers';
import Device from '../src/models/Device';

describe('Devices API — ownership scoping', () => {
  it('admin sees all devices', async () => {
    const { user: admin, password: adminPass } = await createUser({ role: 'admin' });
    const { user: owner } = await createUser();
    await Device.create([
      { deviceId: 'dev-a1', name: 'TV A1', assignedUserId: owner._id },
      { deviceId: 'dev-b1', name: 'TV B1' },
    ]);
    const token = await loginAs(admin.email, adminPass);
    const res = await api().get('/api/devices').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('regular user sees only assigned devices', async () => {
    const { user: owner, password } = await createUser();
    const { user: other } = await createUser();
    await Device.create([
      { deviceId: 'dev-own1', name: 'Mine', assignedUserId: owner._id },
      { deviceId: 'dev-other1', name: 'Theirs', assignedUserId: other._id },
    ]);
    const token = await loginAs(owner.email, password);
    const res = await api().get('/api/devices').set(authHeader(token));
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((d: any) => d.deviceId);
    expect(ids).toContain('dev-own1');
    expect(ids).not.toContain('dev-other1');
  });

  it('user cannot read another user\'s device detail', async () => {
    const { user: owner } = await createUser();
    const { user: attacker, password: attackerPass } = await createUser();
    await Device.create({ deviceId: 'dev-secret', name: 'Secret TV', assignedUserId: owner._id });
    const token = await loginAs(attacker.email, attackerPass);
    const res = await api().get('/api/devices/dev-secret').set(authHeader(token));
    expect([403, 404]).toContain(res.status);
  });

  it('owner can read own device detail', async () => {
    const { user: owner, password } = await createUser();
    await Device.create({ deviceId: 'dev-mine', name: 'My TV', assignedUserId: owner._id });
    const token = await loginAs(owner.email, password);
    const res = await api().get('/api/devices/dev-mine').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.deviceId || res.body.device?.deviceId).toBe('dev-mine');
  });
});
