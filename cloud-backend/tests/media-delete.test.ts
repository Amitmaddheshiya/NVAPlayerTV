import { api, createUser, loginAs, authHeader } from './helpers';
import Media from '../src/models/Media';
import Device from '../src/models/Device';
import ScheduleTemplate from '../src/models/Schedule';

const makeMedia = (overrides: any = {}) => Media.create({
  filename: 'clip.mp4',
  originalName: 'clip.mp4',
  mimeType: 'video/mp4',
  size: 1024,
  url: 'http://localhost:3000/api/media/file/uploads/clip.mp4',
  path: 'uploads/clip.mp4',
  section: 1,
  ...overrides,
});

describe('Media delete — in-use protection (schedule profiles & templates)', () => {
  it('media referenced only by a device schedule profile is soft-deleted, not removed', async () => {
    const { user, password } = await createUser();
    const media = await makeMedia({ uploadedBy: user._id });
    await Device.create({
      deviceId: 'dev-sched',
      name: 'Scheduled TV',
      assignedUserId: user._id,
      config: {
        schedule: {
          profiles: [
            { config: { sections: [{ contentType: 'multimedia', mediaUrls: [media.url] }] } },
          ],
        },
      },
    });
    const token = await loginAs(user.email, password);
    const res = await api().delete(`/api/media/${media._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
    const after = await Media.findById(media._id);
    expect(after?.deletedFromLibrary).toBe(true);
  });

  it('media referenced only by a schedule template is soft-deleted, not removed', async () => {
    const { user, password } = await createUser();
    const media = await makeMedia({
      uploadedBy: user._id,
      url: 'http://localhost:3000/api/media/file/uploads/tpl.mp4',
      path: 'uploads/tpl.mp4',
    });
    await ScheduleTemplate.create({
      name: 'Template',
      targetType: 'device',
      targetId: 'dev-x',
      ownerId: user._id,
      config: { sections: [{ contentType: 'multimedia', mediaUrls: [media.url] }] },
      schedule: { mode: 'dayWise', days: [1] },
    });
    const token = await loginAs(user.email, password);
    const res = await api().delete(`/api/media/${media._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
    const after = await Media.findById(media._id);
    expect(after?.deletedFromLibrary).toBe(true);
  });

  it('media referenced by legacy top-level config.mediaUrls is protected', async () => {
    const { user, password } = await createUser();
    const media = await makeMedia({
      uploadedBy: user._id,
      url: 'http://localhost:3000/api/media/file/uploads/legacy.mp4',
      path: 'uploads/legacy.mp4',
    });
    await Device.create({
      deviceId: 'dev-legacy',
      name: 'Legacy TV',
      assignedUserId: user._id,
      config: { mediaUrls: [media.url] },
    });
    const token = await loginAs(user.email, password);
    const res = await api().delete(`/api/media/${media._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
  });

  it('user cannot delete another user\'s media', async () => {
    const { user: owner } = await createUser();
    const { user: attacker, password } = await createUser();
    const media = await makeMedia({ uploadedBy: owner._id });
    const token = await loginAs(attacker.email, password);
    const res = await api().delete(`/api/media/${media._id}`).set(authHeader(token));
    expect(res.status).toBe(403);
    expect(await Media.findById(media._id)).not.toBeNull();
  });
});
