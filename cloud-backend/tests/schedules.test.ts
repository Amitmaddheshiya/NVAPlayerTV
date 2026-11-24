import { api, createUser, loginAs, authHeader } from './helpers';
import Device from '../src/models/Device';

const schedulePayload = (targetId: string) => ({
  name: 'Morning',
  targetType: 'device',
  targetId,
  config: {},
  schedule: { mode: 'dayWise', days: [1, 2, 3, 4, 5] },
});

describe('Schedules API — sub-user resourceAccess enforcement', () => {
  it('sub-user cannot create schedule for device outside resourceAccess', async () => {
    const { user: parent } = await createUser();
    await Device.create({ deviceId: 'dev-parent', name: 'Parent TV', assignedUserId: parent._id });
    const { user: sub, password } = await createUser({
      role: 'sub-user',
      parentId: parent._id,
      resourceAccess: { devices: [], groups: [] },
    });
    const token = await loginAs(sub.email, password);
    const res = await api().post('/api/schedules').set(authHeader(token)).send(schedulePayload('dev-parent'));
    expect(res.status).toBe(403);
  });

  it('sub-user can create schedule for device inside resourceAccess', async () => {
    const { user: parent } = await createUser();
    await Device.create({ deviceId: 'dev-allowed', name: 'Allowed TV', assignedUserId: parent._id });
    const { user: sub, password } = await createUser({
      role: 'sub-user',
      parentId: parent._id,
      resourceAccess: { devices: ['dev-allowed'], groups: [] },
    });
    const token = await loginAs(sub.email, password);
    const res = await api().post('/api/schedules').set(authHeader(token)).send(schedulePayload('dev-allowed'));
    expect(res.status).toBe(201);
  });

  it('parent user can create schedule for own device', async () => {
    const { user: parent, password } = await createUser();
    await Device.create({ deviceId: 'dev-own', name: 'Own TV', assignedUserId: parent._id });
    const token = await loginAs(parent.email, password);
    const res = await api().post('/api/schedules').set(authHeader(token)).send(schedulePayload('dev-own'));
    expect(res.status).toBe(201);
  });

  it('user cannot create schedule for another user\'s device', async () => {
    const { user: owner } = await createUser();
    const { user: attacker, password } = await createUser();
    await Device.create({ deviceId: 'dev-victim', name: 'Victim TV', assignedUserId: owner._id });
    const token = await loginAs(attacker.email, password);
    const res = await api().post('/api/schedules').set(authHeader(token)).send(schedulePayload('dev-victim'));
    expect(res.status).toBe(403);
  });
});
