import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { RefreshSession, User } from '../src/models';
import { normalizePhone } from '../src/utils/phone';
import { api, app, login, resetDb, startDb, stopDb } from './helpers';

describe('Нэвтрэлт', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(resetDb);

  it('утасны дугаарыг E.164 болгож, буруу дугаарыг татгалзана', () => {
    expect(normalizePhone('9911 2233')).toBe('+97699112233');
    expect(normalizePhone('+976 8811-2233')).toBe('+97688112233');
    expect(normalizePhone('0097699112233')).toBe('+97699112233');
    expect(() => normalizePhone('1234')).toThrow();
    expect(() => normalizePhone('12345678')).toThrow();
  });

  it('утас, нууц үгээр бүртгүүлж шууд нэвтэрнэ, нууц үг argon2id-ээр хадгалагдана', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ phone: '9911 2233', password: 'Strong-pass-1', name: 'Бат' });
    expect(reg.status).toBe(201);
    expect(([] as string[]).concat(reg.headers['set-cookie']).join(';')).toMatch(/HttpOnly/);
    const u = await User.findOne({ phone: '+97699112233' }).select('+passwordHash').lean();
    expect(u!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect((await agent.get('/api/auth/me')).body.user.phone).toBe('+97699112233');
    expect((await api().post('/api/auth/login').send({ phone: '99112233', password: 'Strong-pass-1' })).status).toBe(200);
  });

  it('бүртгэл: давхар дугаар, буруу дугаар, богино нууц үгийг татгалзана', async () => {
    const body = { phone: '99112244', password: 'Strong-pass-1' };
    expect((await api().post('/api/auth/register').send(body)).status).toBe(201);
    const dup = await api().post('/api/auth/register').send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PHONE_TAKEN');
    expect((await api().post('/api/auth/register').send({ ...body, phone: '12345678' })).status).toBe(400);
    expect((await api().post('/api/auth/register').send({ phone: '99112255', password: 'short' })).status).toBe(400);
  });

  it('бүртгэлээр эрх, төлөв өөрчилж чадахгүй', async () => {
    const res = await api().post('/api/auth/register').send({ phone: '99112266', password: 'Strong-pass-1', role: 'superadmin', status: 'blocked', email: 'x@example.com' });
    expect(res.status).toBe(201);
    const u = await User.findOne({ phone: '+97699112266' }).lean();
    expect(u!.role).toBe('user');
    expect(u!.status).toBe('active');
    expect(u!.email).toBeUndefined();
  });

  it('SMS, OTP-ийн замууд байхгүй', async () => {
    for (const url of ['/api/auth/send-otp', '/api/auth/verify-otp', '/api/auth/reset-password']) {
      expect((await api().post(url).send({})).status).toBe(404);
    }
    const { agent } = await login('superadmin');
    expect((await agent.get('/api/admin/settings/sms')).status).toBe(404);
    expect((await agent.post('/api/admin/settings/sms').send({})).status).toBe(404);
  });

  it('буруу нууц үгийг олон удаа оролдоход түгжинэ', async () => {
    const { phone, password } = await login();
    for (let i = 0; i < 5; i++) await api().post('/api/auth/login').send({ phone, password: 'wrong-password' });
    const locked = await api().post('/api/auth/login').send({ phone, password });
    expect(locked.status).toBe(429);
  });

  it('refresh token эргэлддэг; хуучин токен дахин ирвэл бүх сешн хаагдана', async () => {
    const { agent } = await login();
    const first = await agent.post('/api/auth/refresh');
    expect(first.status).toBe(200);
    const sessions = await RefreshSession.find().lean();
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => !JSON.stringify(s).includes('mf_refresh'))).toBe(true);

    const { user } = await login();
    const agentB = request.agent(app);
    const r1 = await agentB.post('/api/auth/login').send({ phone: user.phone, password: 'Test-password-123' });
    const oldCookie = r1.headers['set-cookie'] as unknown as string[];
    const refreshCookie = oldCookie.find((c) => c.startsWith('mf_refresh'))!.split(';')[0];
    expect((await api().post('/api/auth/refresh').set('Cookie', refreshCookie)).status).toBe(200);
    expect((await api().post('/api/auth/refresh').set('Cookie', refreshCookie)).status).toBe(401);
    const live = await RefreshSession.find({ userId: user._id, revokedAt: { $exists: false } }).lean();
    expect(live.filter((s) => !s.replacedAt)).toHaveLength(1); // эхний login-ий тусдаа сешн л үлдэнэ
  });

  it('админ зөвхөн имэйлээр, хэрэглэгч зөвхөн утсаар нэвтэрнэ', async () => {
    const admin = await login('superadmin');
    expect((await api().post('/api/auth/admin/login').send({ email: admin.email, password: admin.password })).status).toBe(200);
    expect((await api().post('/api/auth/admin/login').send({ email: admin.email!.toUpperCase(), password: admin.password })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ phone: admin.phone, password: admin.password })).status).toBe(401);

    const u = await login();
    await User.updateOne({ _id: u.user._id }, { $set: { email: 'plain@example.com' } });
    expect((await api().post('/api/auth/login').send({ phone: u.phone, password: u.password })).status).toBe(200);
    expect((await api().post('/api/auth/admin/login').send({ email: 'plain@example.com', password: u.password })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ phone: 'plain@example.com', password: u.password })).status).toBe(400);
  });

  it('админы буруу имэйл, нууц үг ижил алдаа өгч, 5 оролдлогод түгжинэ', async () => {
    const { email, password } = await login('admin');
    const a = await api().post('/api/auth/admin/login').send({ email, password: 'wrong-password' });
    const b = await api().post('/api/auth/admin/login').send({ email: 'none@example.com', password: 'wrong-password' });
    expect(a.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
    for (let i = 0; i < 4; i++) await api().post('/api/auth/admin/login').send({ email, password: 'wrong-password' });
    expect((await api().post('/api/auth/admin/login').send({ email, password })).status).toBe(429);
  });

  it('"Намайг сануул" сонгоогүй бол refresh cookie нь сешн хугацаатай, rotation-д ч хэвээр', async () => {
    const { email, password } = await login('admin');
    const refreshCookie = (r: request.Response) => ([] as string[]).concat(r.headers['set-cookie']).find((c) => c.startsWith('mf_refresh='))!;
    const agent = request.agent(app);
    const short = await agent.post('/api/auth/admin/login').send({ email, password, remember: false });
    expect(refreshCookie(short)).not.toMatch(/Expires=/i);
    expect(refreshCookie(await agent.post('/api/auth/refresh'))).not.toMatch(/Expires=/i);
    const long = await api().post('/api/auth/admin/login').send({ email, password, remember: true });
    expect(refreshCookie(long)).toMatch(/Expires=/i);
  });

  it('нууц үг солиход хуучин нь ажиллахгүй, бусад төхөөрөмж гарна', async () => {
    const { agent, phone, password } = await login();
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ phone, password });

    expect((await agent.post('/api/auth/change-password').send({ currentPassword: 'wrong', newPassword: 'New-password-123' })).status).toBe(400);
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: password, newPassword: 'short' })).status).toBe(400);
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: password, newPassword: 'New-password-123' })).status).toBe(200);

    expect((await api().post('/api/auth/login').send({ phone, password })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ phone, password: 'New-password-123' })).status).toBe(200);
    expect((await other.post('/api/auth/refresh')).status).toBe(401);
    expect((await agent.post('/api/auth/refresh')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('нэвтрээгүй хэрэглэгч нууц үг сольж чадахгүй', async () => {
    expect((await api().post('/api/auth/change-password').send({ currentPassword: 'a', newPassword: 'New-password-123' })).status).toBe(401);
  });

  it('блоклогдсон хэрэглэгч хүсэлт хийж чадахгүй', async () => {
    const { agent, user } = await login();
    await User.updateOne({ _id: user._id }, { $set: { status: 'blocked' } });
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('NoSQL injection оролдлогыг татгалзана', async () => {
    const res = await api().post('/api/auth/login').send({ phone: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('зөвшөөрөгдсөн өөр хостын вэб cookie-тэй хандаж чадна', async () => {
    const { phone, password } = await login();
    const web = 'http://localhost:3110';
    const preflight = await api().options('/api/auth/login').set('Origin', web).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type');
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers['access-control-allow-origin']).toBe(web);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    const res = await api().post('/api/auth/login').set('Origin', web).send({ phone, password });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(web);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const evil = await api().options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('зөвшөөрөгдөөгүй Origin-ээс ирсэн POST-г хаана', async () => {
    const res = await api().post('/api/auth/login').set('Origin', 'https://evil.example').send({ phone: '99112233', password: 'x' });
    expect(res.status).toBe(403);
  });
});
