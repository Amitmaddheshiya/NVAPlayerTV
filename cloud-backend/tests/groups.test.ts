import { api, createUser, loginAs, authHeader } from './helpers';
import Group from '../src/models/Group';

describe('Groups API — GET /groups/:id access control', () => {
  it('owner can fetch own group', async () => {
    const { user, password } = await createUser();
    const group = await Group.create({ name: 'Lobby Screens', devices: [], ownerId: user._id });
    const token = await loginAs(user.email, password);
    const res = await api().get(`/api/groups/${group._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Lobby Screens');
  });

  it('other user gets 403', async () => {
    const { user: owner } = await createUser();
    const { user: other, password: otherPass } = await createUser();
    const group = await Group.create({ name: 'Private Group', devices: [], ownerId: owner._id });
    const token = await loginAs(other.email, otherPass);
    const res = await api().get(`/api/groups/${group._id}`).set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('admin can fetch any group', async () => {
    const { user: owner } = await createUser();
    const { user: admin, password: adminPass } = await createUser({ role: 'admin' });
    const group = await Group.create({ name: 'Admin View', devices: [], ownerId: owner._id });
    const token = await loginAs(admin.email, adminPass);
    const res = await api().get(`/api/groups/${group._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown group', async () => {
    const { user, password } = await createUser({ role: 'admin' });
    const token = await loginAs(user.email, password);
    const res = await api().get('/api/groups/000000000000000000000000').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('sub-user outside resourceAccess gets 403', async () => {
    const { user: parent } = await createUser();
    const { user: sub, password: subPass } = await createUser({
      role: 'sub-user',
      parentId: parent._id,
      resourceAccess: { devices: [], groups: [] },
    });
    const group = await Group.create({ name: 'Sub Denied', devices: [], ownerId: parent._id });
    const token = await loginAs(sub.email, subPass);
    const res = await api().get(`/api/groups/${group._id}`).set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('sub-user inside resourceAccess can fetch', async () => {
    const { user: parent } = await createUser();
    const group = await Group.create({ name: 'Sub Allowed', devices: [], ownerId: parent._id });
    const { user: sub, password: subPass } = await createUser({
      role: 'sub-user',
      parentId: parent._id,
      resourceAccess: { devices: [], groups: [String(group._id)] },
    });
    const token = await loginAs(sub.email, subPass);
    const res = await api().get(`/api/groups/${group._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
  });
});
