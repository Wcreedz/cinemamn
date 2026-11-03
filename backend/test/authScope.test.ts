import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { User } from '../src/models';
import { AuthService } from '../src/services/auth.service';
import { api, app, login, nextPhone, resetDb, startDb, stopDb } from './helpers';
import { hashPassword } from '../src/services/auth.service';

const ADMIN = 'admin';
const PASSWORD = 'Test-password-123';

// Нэг cookie-н сав: нэг хөтчийн бүх таб.
async function sameBrowser() {
  const phone = nextPhone();
  const customer = await User.create({ phone, passwordHash: await hashPassword(PASSWORD), name: 'Хэрэглэгч' });
  const email = 'staff@example.com';
  const admin = await User.create({ phone: nextPhone(), email, passwordHash: await hashPassword(PASSWORD), role: 'admin', name: 'Админ' });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/admin/login').send({ email, password: PASSWORD, remember: true })).status).toBe(200);
  expect((await agent.post('/api/auth/login').send({ phone, password: PASSWORD })).status).toBe(200);
  const site = () => agent.get('/api/auth/me');
  const adminTab = () => agent.get('/api/auth/me').set('X-Auth-Scope', ADMIN);
  return { agent, customer, admin, site, adminTab };
}

describe('Админ, хэрэглэгчийн тусдаа сесс', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(resetDb);

  it('нэг хөтчид хоёулаа зэрэг ажиллана, аль аль нь нөгөөгөө дарахгүй', async () => {
    const { agent, customer, admin, site, adminTab } = await sameBrowser();
    expect((await site()).body.user.id).toBe(String(customer._id));
    expect((await adminTab()).body.user.id).toBe(String(admin._id));
    expect((await agent.get('/api/admin/dashboard')).status).toBe(200);
    expect((await agent.get('/api/subscriptions/me')).status).toBe(200);
  });

  it('дараалал эсрэгээрээ байсан ч ижил: хэрэглэгч эхэлж, дараа нь админ', async () => {
    const phone = nextPhone();
    await User.create({ phone, passwordHash: await hashPassword(PASSWORD) });
    await User.create({ phone: nextPhone(), email: 'x@example.com', passwordHash: await hashPassword(PASSWORD), role: 'superadmin' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone, password: PASSWORD });
    await agent.post('/api/auth/admin/login').send({ email: 'x@example.com', password: PASSWORD });
    expect((await agent.get('/api/auth/me')).body.user.role).toBe('user');
    expect((await agent.get('/api/auth/me').set('X-Auth-Scope', ADMIN)).body.user.role).toBe('superadmin');
  });

  it('хэрэглэгч гарахад админ үлдэнэ', async () => {
    const { agent, site, adminTab } = await sameBrowser();
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await site()).status).toBe(401);
    expect((await agent.post('/api/auth/refresh')).status).toBe(401);
    expect((await adminTab()).status).toBe(200);
    expect((await agent.get('/api/admin/dashboard')).status).toBe(200);
  });

  it('админ гарахад хэрэглэгч үлдэнэ', async () => {
    const { agent, site, adminTab } = await sameBrowser();
    expect((await agent.post('/api/auth/logout').set('X-Auth-Scope', ADMIN)).status).toBe(200);
    expect((await adminTab()).status).toBe(401);
    expect((await agent.get('/api/admin/dashboard')).status).toBe(403);
    expect((await site()).status).toBe(200);
  });

  it('refresh зөвхөн өөрийн сессийг шинэчилж, хариуд нь өөрийн cookie л тавина', async () => {
    const { agent, customer, admin } = await sameBrowser();
    const a = await agent.post('/api/auth/refresh').set('X-Auth-Scope', ADMIN);
    expect(a.body.user.id).toBe(String(admin._id));
    const set = ([] as string[]).concat(a.headers['set-cookie']).map((c) => c.split('=')[0]);
    expect(set.sort()).toEqual(['mf_admin_access', 'mf_admin_refresh']);
    const c = await agent.post('/api/auth/refresh');
    expect(c.body.user.id).toBe(String(customer._id));
    expect(([] as string[]).concat(c.headers['set-cookie']).map((x) => x.split('=')[0]).sort()).toEqual(['mf_access', 'mf_refresh']);
  });

  it('cookie бүгд HttpOnly, нэрээрээ тусдаа', async () => {
    const { email, password } = await login('admin');
    const res = await api().post('/api/auth/admin/login').send({ email, password });
    const cookies = ([] as string[]).concat(res.headers['set-cookie']);
    expect(cookies.map((c) => c.split('=')[0]).sort()).toEqual(['mf_admin_access', 'mf_admin_refresh']);
    expect(cookies.every((c) => /HttpOnly/.test(c))).toBe(true);
  });

  it('хэрэглэгч толгой хуурамчаар тавьж админ болж чадахгүй', async () => {
    const viewer = await login();
    expect((await viewer.agent.get('/api/auth/me').set('X-Auth-Scope', ADMIN)).status).toBe(401);
    expect((await viewer.agent.get('/api/admin/dashboard').set('X-Auth-Scope', ADMIN)).status).toBe(403);
    expect((await viewer.agent.post('/api/auth/refresh').set('X-Auth-Scope', ADMIN)).status).toBe(401);
    expect((await viewer.agent.get('/api/auth/me')).status).toBe(200);
  });

  it('админы cookie хэрэглэгчийн замд, хэрэглэгчийнх админы замд хүчингүй', async () => {
    const admin = await login('admin');
    expect((await admin.agent.get('/api/auth/me')).status).toBe(401);
    expect((await admin.agent.get('/api/admin/dashboard')).status).toBe(200);
    const anonymous = api();
    expect((await anonymous.get('/api/admin/dashboard')).status).toBe(401);
  });

  it('хуучин хувилбарын админ cookie админ эрх өгөхгүй, refresh нь цэвэрлэгдэнэ', async () => {
    const admin = await login('admin');
    const { refreshToken, familyId } = await AuthService.issueSession(admin.user._id, {});
    const legacy = AuthService.signAccess(admin.user, familyId);
    const cookie = `mf_access=${legacy}; mf_refresh=${refreshToken}`;
    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await api().get('/api/admin/dashboard').set('Cookie', cookie)).status).toBe(401);
    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(([] as string[]).concat(res.headers['set-cookie']).join(';')).toMatch(/mf_refresh=;/);
  });

  it('эрх хасагдсан админ тэр дороо гарна', async () => {
    const admin = await login('admin');
    await User.updateOne({ _id: admin.user._id }, { $set: { role: 'user' } });
    expect((await admin.agent.get('/api/admin/dashboard')).status).toBe(401);
    expect((await admin.agent.post('/api/auth/refresh').set('X-Auth-Scope', ADMIN)).status).toBe(401);
  });

  it('админ нууц үгээ солиход зөвхөн админ сесс шинэчлэгдэнэ', async () => {
    const admin = await login('admin');
    const res = await admin.agent.post('/api/auth/change-password').set('X-Auth-Scope', ADMIN).send({ currentPassword: admin.password, newPassword: 'New-password-123' });
    expect(res.status).toBe(200);
    expect(([] as string[]).concat(res.headers['set-cookie']).map((c) => c.split('=')[0]).sort()).toEqual(['mf_admin_access', 'mf_admin_refresh']);
    expect((await admin.agent.get('/api/admin/dashboard')).status).toBe(200);
  });

  it('session нь аль сесс байгааг л хэлнэ, токен гаргахгүй', async () => {
    expect((await api().get('/api/auth/session')).body).toEqual({ customer: false, admin: false });
    const admin = await login('admin');
    expect((await admin.agent.get('/api/auth/session')).body).toEqual({ customer: false, admin: true });
    const viewer = await login();
    expect((await viewer.agent.get('/api/auth/session')).body).toEqual({ customer: true, admin: false });
    const { agent } = await sameBrowser();
    expect((await agent.get('/api/auth/session')).body).toEqual({ customer: true, admin: true });
  });

  it('эрхгүй хүн нэвтрэх замаа хольж чадахгүй хэвээр', async () => {
    const { admin } = await sameBrowser();
    expect((await api().post('/api/auth/login').send({ phone: admin.phone, password: PASSWORD })).status).toBe(401);
  });
});
