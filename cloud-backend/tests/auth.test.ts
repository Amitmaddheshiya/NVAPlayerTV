import { api, createUser, loginAs, authHeader } from './helpers';

describe('Auth API', () => {
  it('registers a new user', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'new@test.com', password: 'Secret@1' });
    expect(res.status).toBe(201);
  });

  it('rejects duplicate registration', async () => {
    await api().post('/api/auth/register').send({ email: 'dup@test.com', password: 'Secret@1' });
    const res = await api().post('/api/auth/register').send({ email: 'dup@test.com', password: 'Secret@2' });
    expect(res.status).toBe(400);
  });

  it('rejects missing fields', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });

  it('logs in with valid credentials and returns a token', async () => {
    const { user, password } = await createUser({ email: 'login@test.com' });
    const res = await api().post('/api/auth/login').send({ email: 'login@test.com', password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.id).toBe(String(user._id));
  });

  it('rejects wrong password', async () => {
    await createUser({ email: 'wrong@test.com', password: 'Right@1' });
    const res = await api().post('/api/auth/login').send({ email: 'wrong@test.com', password: 'Wrong@1' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'ghost@test.com', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('requires auth for protected routes', async () => {
    const res = await api().get('/api/devices');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await api().get('/api/devices').set(authHeader('not-a-jwt'));
    expect(res.status).toBe(401);
  });

  it('loginAs helper returns a usable token', async () => {
    const { user, password } = await createUser();
    const token = await loginAs(user.email, password);
    const res = await api().get('/api/devices').set(authHeader(token));
    expect(res.status).toBe(200);
  });
});
