import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Otp, RefreshSession, User } from '../src/models';
import { devOutbox } from '../src/services/sms.provider';
import { normalizePhone } from '../src/utils/phone';
import { api, app, login, resetDb, startDb, stopDb } from './helpers';

const code = () => /(\d{6})/.exec(devOutbox[devOutbox.length - 1].text)![1];

describe('Нэвтрэлт ба OTP', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => { await resetDb(); devOutbox.length = 0; });

  it('утасны дугаарыг E.164 болгож, буруу дугаарыг татгалзана', () => {
    expect(normalizePhone('9911 2233')).toBe('+97699112233');
    expect(normalizePhone('+976 8811-2233')).toBe('+97688112233');
    expect(normalizePhone('0097699112233')).toBe('+97699112233');
    expect(() => normalizePhone('1234')).toThrow();
    expect(() => normalizePhone('12345678')).toThrow();
  });

  it('бүтэн бүртгэлийн урсгал: OTP хадгалагдахдаа hash хэлбэртэй', async () => {
    const send = await api().post('/api/auth/send-otp').send({ phone: '99112233' });
    expect(send.status).toBe(200);
    const stored = await Otp.findOne({ phone: '+97699112233' }).lean();
    expect(stored!.otpHash).not.toContain(code());
    expect(stored!.otpHash).toHaveLength(64);

    const verify = await api().post('/api/auth/verify-otp').send({ phone: '99112233', code: code() });
    expect(verify.status).toBe(200);
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ verificationToken: verify.body.verificationToken, password: 'Strong-pass-1', name: 'Бат' });
    expect(reg.status).toBe(201);
    expect(([] as string[]).concat(reg.headers['set-cookie']).join(';')).toMatch(/HttpOnly/);
    const u = await User.findOne({ phone: '+97699112233' }).select('+passwordHash').lean();
    expect(u!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect((await agent.get('/api/auth/me')).body.user.phone).toBe('+97699112233');

    // Баталгаажуулалтыг дахин ашиглах боломжгүй
    const again = await api().post('/api/auth/register').send({ verificationToken: verify.body.verificationToken, password: 'Strong-pass-1' });
    expect(again.status).toBe(401);
  });

  it('OTP-н оролдлого хязгаарлагдана (5 удаа)', async () => {
    await api().post('/api/auth/send-otp').send({ phone: '99112244' });
    const right = code();
    const wrong = right === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) {
      expect((await api().post('/api/auth/verify-otp').send({ phone: '99112244', code: wrong })).status).toBe(400);
    }
    expect((await api().post('/api/auth/verify-otp').send({ phone: '99112244', code: right })).status).toBe(400);
  });

  it('хугацаа дууссан OTP-г татгалзана', async () => {
    await api().post('/api/auth/send-otp').send({ phone: '99112255' });
    await Otp.updateOne({ phone: '+97699112255' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api().post('/api/auth/verify-otp').send({ phone: '99112255', code: code() })).status).toBe(400);
  });

  it('дахин илгээх cooldown ажиллана', async () => {
    await api().post('/api/auth/send-otp').send({ phone: '99112266' });
    const second = await api().post('/api/auth/send-otp').send({ phone: '99112266' });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('OTP_COOLDOWN');
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

  it('блоклогдсон хэрэглэгч хүсэлт хийж чадахгүй', async () => {
    const { agent, user } = await login();
    await User.updateOne({ _id: user._id }, { $set: { status: 'blocked' } });
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('NoSQL injection оролдлогыг татгалзана', async () => {
    const res = await api().post('/api/auth/login').send({ phone: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('зөвшөөрөгдөөгүй Origin-ээс ирсэн POST-г хаана', async () => {
    const res = await api().post('/api/auth/login').set('Origin', 'https://evil.example').send({ phone: '99112233', password: 'x' });
    expect(res.status).toBe(403);
  });
});
