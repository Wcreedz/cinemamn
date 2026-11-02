import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'http';
import mongoose from 'mongoose';
import { AdminLog, Payment, QPayConfiguration, SmsConfiguration, Subscription } from '../src/models';
import { decryptSecret, encryptSecret } from '../src/utils/crypto';
import { devOutbox } from '../src/services/sms.provider';
import { api, FakeQPay, login, qpayInput, resetDb, seedMerchant, startDb, stopDb } from './helpers';

const qpay = new FakeQPay();
const monthly = (price: number) => ({
  value: { enabled: true, paymentRequired: true, currency: 'MNT', paymentExpiryMinutes: 60, plans: [{ code: 'MONTHLY', name: 'Сарын эрх', price, durationDays: 30, enabled: true }] },
});

describe('Админ тохиргоо', () => {
  beforeAll(async () => { await startDb(); await qpay.start(); });
  afterAll(async () => { await qpay.stop(); await stopDb(); });
  beforeEach(async () => { await resetDb(); qpay.reset(); devOutbox.length = 0; });

  it('үнэ 14,900 -> 19,900: шинэ нэхэмжлэх шинэ үнэтэй, хуучин нь болон эрх өөрчлөгдөхгүй', async () => {
    await seedMerchant();
    const admin = await login('admin');
    expect((await admin.agent.post('/api/admin/settings/qpay').send(qpayInput())).status).toBe(201);

    expect((await api().get('/api/subscriptions/plans')).body.plans[0].price).toBe(14900);
    const buyer = await login();
    const oldInv = await buyer.agent.post('/api/payments/qpay/create').send({ planCode: 'MONTHLY' });
    expect(oldInv.body.amount).toBe(14900);
    const oldDoc = (await Payment.findById(oldInv.body.id).lean())!;

    const holder = await login();
    const expiry = new Date(Date.now() + 5 * 86_400_000);
    await Subscription.create({ seq: 1, userId: holder.user._id, planCode: 'MONTHLY', amount: 14900, currency: 'MNT', status: 'active', startedAt: new Date(), expiresAt: expiry });

    const put = await admin.agent.put('/api/admin/settings/subscription').send(monthly(19900));
    expect(put.status).toBe(200);

    // Нийтийн хуудас шинэ үнийг шууд авна
    expect((await api().get('/api/subscriptions/plans')).body.plans[0].price).toBe(19900);
    // Шинэ нэхэмжлэх
    const newInv = await buyer.agent.post('/api/payments/qpay/create').send({ planCode: 'MONTHLY' });
    expect(newInv.body.amount).toBe(19900);
    expect(newInv.body.id).not.toBe(oldInv.body.id);
    expect(qpay.invoices.get((await Payment.findById(newInv.body.id).lean())!.invoiceId!)!.amount).toBe(19900);
    // Хуучин нэхэмжлэх 14,900 хэвээр, 14,900-аар төлөгдвөл амжилттай
    const reread = (await Payment.findById(oldInv.body.id).lean())!;
    expect(reread.amount).toBe(14900);
    expect(reread.pricingVersion).toBe(oldDoc.pricingVersion);
    qpay.markPaid(reread.invoiceId!);
    expect((await api().get(`/api/payments/qpay/callback?order=${reread.orderNumber}`)).body.outcome).toBe('paid');
    // Идэвхтэй эрхийн огноо хэвээр
    const sub = await Subscription.findOne({ userId: holder.user._id }).lean();
    expect(sub!.expiresAt.getTime()).toBe(expiry.getTime());
    expect(await AdminLog.countDocuments({ action: 'settings.subscription.update' })).toBe(1);
  });

  it('хүчингүй үнэ, давхардсан багцыг татгалзана', async () => {
    const admin = await login('admin');
    expect((await admin.agent.put('/api/admin/settings/subscription').send(monthly(-5))).status).toBe(400);
    const dup = monthly(100);
    dup.value.plans.push({ ...dup.value.plans[0] });
    expect((await admin.agent.put('/api/admin/settings/subscription').send(dup)).status).toBe(400);
  });

  it('зэрэг засварлалтыг expectedVersion-ээр илрүүлнэ', async () => {
    const admin = await login('admin');
    const res = await admin.agent.put('/api/admin/settings/subscription').send({ ...monthly(100), expectedVersion: 42 });
    expect(res.status).toBe(409);
  });

  it('энгийн админ production QPay тохиргоог өөрчилж чадахгүй, superadmin чадна', async () => {
    await seedMerchant();
    const admin = await login('admin');
    const res = await admin.agent.post('/api/admin/settings/qpay').send(qpayInput({ environment: 'production', enabled: false }));
    expect(res.status).toBe(403);
    const sup = await login('superadmin');
    const ok = await sup.agent.post('/api/admin/settings/qpay').send(qpayInput({ environment: 'production', enabled: false }));
    expect(ok.status).toBe(201);
    // Одоогийн production тохиргоог энгийн админ sandbox-оор сольж чадахгүй
    expect((await admin.agent.post('/api/admin/settings/qpay').send(qpayInput())).status).toBe(403);
  });

  it('серверийн орчинтой таарахгүй тохиргоог идэвхжүүлэхгүй', async () => {
    await seedMerchant();
    const sup = await login('superadmin');
    const res = await sup.agent.post('/api/admin/settings/qpay').send(qpayInput({ environment: 'production', enabled: true }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('QPAY_VALIDATION_FAILED');
  });

  it('QPay холболтын тест бодит алдааг мэдээлнэ', async () => {
    await seedMerchant();
    const admin = await login('admin');
    const ok = await admin.agent.post('/api/admin/settings/qpay/test').send(qpayInput());
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(qpay.authCalls).toBeGreaterThan(0);

    await mongoose.connection.db.collection('token').deleteMany({});
    qpay.rejectAuth = true;
    const bad = await admin.agent.post('/api/admin/settings/qpay/test').send(qpayInput());
    expect(bad.status).toBe(502);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.message).toMatch(/QPay алдаа/);
  });

  it('merchant шалгалт буруу салбар/дансыг олж мэдээлнэ', async () => {
    await seedMerchant();
    const admin = await login('admin');
    const good = await admin.agent.post('/api/admin/settings/qpay/verify').send(qpayInput());
    expect(good.body.ok).toBe(true);
    const bad = await admin.agent.post('/api/admin/settings/qpay/verify').send(qpayInput({ salbariinId: 'missing' }));
    expect(bad.body.ok).toBe(false);
    const dans = await admin.agent.post('/api/admin/settings/qpay/verify').send(qpayInput({ dansniiDugaar: '999' }));
    expect(dans.body.ok).toBe(false);
  });

  it('харилцагчийг багцаар бүртгэж зөвхөн superadmin-д дансны дугаар бүтнээр харагдана', async () => {
    const body = {
      type: 'COMPANY', baiguullagiinId: 'org-9', register_number: '1234567', name: 'Шинэ ХХК', mcc_code: '5641', city: '11000', district: '17000', address: 'х', phone: '99000000', email: 'n@example.com',
      salbaruud: [{ salbariinId: 'b-9', salbariinNer: 'Төв', qpayShimtgelTurul: false, bank_accounts: [{ account_bank_code: '050000', account_number: '9000000009', account_name: 'Тест', qpayShimtgelTurul: false }] }],
    };
    const admin = await login('admin');
    expect((await admin.agent.post('/api/admin/settings/qpay/merchant').send(body)).status).toBe(403);
    const sup = await login('superadmin');
    expect((await sup.agent.post('/api/admin/settings/qpay/merchant').send(body)).status).toBe(200);
    expect(qpay.merchantCalls).toBeGreaterThan(0);
    const verify = await admin.agent.post('/api/admin/settings/qpay/verify').send(qpayInput({ baiguullagiinId: 'org-9', salbariinId: 'b-9' }));
    expect(verify.body.ok).toBe(true);
    const masked = await admin.agent.get('/api/admin/settings/qpay/merchant?baiguullagiinId=org-9');
    expect(JSON.stringify(masked.body)).not.toContain('9000000009');
    const full = await sup.agent.get('/api/admin/settings/qpay/merchant?baiguullagiinId=org-9');
    expect(JSON.stringify(full.body)).toContain('9000000009');
  });

  it('SMS нэвтрэх мэдээлэл MongoDB-д шифрлэгдэж, API-р хэзээ ч гарахгүй', async () => {
    const admin = await login('admin');
    const res = await admin.agent.post('/api/admin/settings/sms').send({
      provider: 'http', apiUrl: 'http://127.0.0.1:18932/send', apiKey: 'PLAINTEXT-KEY-123456', apiSecret: 'PLAINTEXT-SECRET-987654', senderId: 'MF', enabled: true, otpExpiryMinutes: 5, resendCooldownSeconds: 60, maxAttempts: 5,
    });
    expect(res.status).toBe(201);
    const raw = await mongoose.connection.db.collection('sms_configurations').findOne({ isCurrent: true });
    const rawText = JSON.stringify(raw);
    expect(rawText).not.toContain('PLAINTEXT-KEY-123456');
    expect(rawText).not.toContain('PLAINTEXT-SECRET-987654');
    expect(raw!.apiSecretEncrypted.startsWith('v1.')).toBe(true);

    const responses = [res, await admin.agent.get('/api/admin/settings/sms'), await admin.agent.get('/api/admin/settings'), await admin.agent.get('/api/admin/settings/history'), await admin.agent.get('/api/admin/logs'), await api().get('/api/settings/public')];
    for (const r of responses) {
      const text = JSON.stringify(r.body);
      expect(text).not.toContain('PLAINTEXT-SECRET');
      expect(text).not.toContain('PLAINTEXT-KEY');
      expect(text).not.toContain('Encrypted');
    }
    expect((await admin.agent.get('/api/admin/settings/sms')).body.apiSecretMasked).toMatch(/^•+/);

    // Хоосон утгаар хадгалахад өмнөх нууц хэвээр үлдэнэ
    await admin.agent.post('/api/admin/settings/sms').send({ provider: 'http', apiUrl: 'http://127.0.0.1:18932/send', senderId: 'MF2', enabled: true, otpExpiryMinutes: 5, resendCooldownSeconds: 60, maxAttempts: 5 });
    const latest = await SmsConfiguration.findOne({ isCurrent: true }).lean();
    expect(decryptSecret(latest!.apiSecretEncrypted!, 'sms.apiSecret')).toBe('PLAINTEXT-SECRET-987654');
  });

  it('тохиргоог зэрэг хадгалбал нэг хувилбар л одоогийнх болж, хоёр дугаар давхцахгүй', async () => {
    const admin = await login('admin');
    const body = { provider: 'mock', enabled: true, otpExpiryMinutes: 5, resendCooldownSeconds: 60, maxAttempts: 5 };
    const results = await Promise.all(Array.from({ length: 5 }, () => admin.agent.post('/api/admin/settings/sms').send(body)));
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    const versions = (await SmsConfiguration.find().lean()).map((c) => c.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect((await admin.agent.get('/api/admin/settings/sms')).body.version).toBe(Math.max(...versions));
  });

  it('хувилбар сэлгэлт дундаа тасарсан ч хамгийн шинэ нь одоогийнх хэвээр', async () => {
    await seedMerchant();
    const sup = await login('superadmin');
    await sup.agent.post('/api/admin/settings/qpay').send(qpayInput({ merchantName: 'Нэг' }));
    await sup.agent.post('/api/admin/settings/qpay').send(qpayInput({ merchantName: 'Хоёр' }));
    await QPayConfiguration.updateMany({}, { $set: { isCurrent: true } });
    expect((await sup.agent.get('/api/admin/settings/qpay')).body.current.merchantName).toBe('Хоёр');
  });

  it('шифр: өөр талбарт зөөсөн, засварласан утгыг илрүүлнэ', () => {
    const enc = encryptSecret('value', 'a');
    expect(decryptSecret(enc, 'a')).toBe('value');
    expect(() => decryptSecret(enc, 'b')).toThrow();
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), 'a')).toThrow();
  });

  it('SMS тест тохируулсан provider-оор илгээж, бодит алдааг буцаана', async () => {
    const received: any[] = [];
    let status = 200;
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => { received.push({ headers: req.headers, body: JSON.parse(raw) }); res.writeHead(status); res.end(status === 200 ? 'ok' : 'denied'); });
    });
    await new Promise<void>((r) => server.listen(18932, '127.0.0.1', r));
    try {
      const admin = await login('admin');
      await admin.agent.post('/api/admin/settings/sms').send({ provider: 'http', apiUrl: 'http://127.0.0.1:18932/send', apiKey: 'k-1234567890', apiSecret: 's-1234567890', senderId: 'MF', enabled: true, otpExpiryMinutes: 5, resendCooldownSeconds: 60, maxAttempts: 5 });
      const ok = await admin.agent.post('/api/admin/settings/sms/test').send({ phone: '99112233' });
      expect(ok.status).toBe(200);
      expect(ok.body.provider).toBe('http');
      expect(received[0].headers['x-api-key']).toBe('k-1234567890');
      expect(received[0].body.to).toBe('+97699112233');
      expect(devOutbox).toHaveLength(0); // mock руу явсангүй
      status = 403;
      const bad = await admin.agent.post('/api/admin/settings/sms/test').send({ phone: '99112233' });
      expect(bad.status).toBe(502);
      expect(bad.body.message).toContain('403');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('SMS идэвхгүй бол OTP илгээсэн мэт дүр эсгэхгүй', async () => {
    const admin = await login('admin');
    await admin.agent.post('/api/admin/settings/sms').send({ provider: 'http', apiUrl: 'http://127.0.0.1:1/x', enabled: false, otpExpiryMinutes: 5, resendCooldownSeconds: 60, maxAttempts: 5 });
    const res = await api().post('/api/auth/send-otp').send({ phone: '99887766' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SMS_NOT_CONFIGURED');
  });

  it('нийтийн тохиргоо нууц мэдээлэл задруулахгүй', async () => {
    await seedMerchant();
    const admin = await login('superadmin');
    await admin.agent.post('/api/admin/settings/qpay').send(qpayInput());
    const res = await api().get('/api/settings/public');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const leak of ['baiguullagiinId', 'callbackUrl', 'storageRoot', 'allowedAdminIps', 'org-1', 'secret']) expect(text).not.toContain(leak);
    expect(res.body.general.siteName).toBe('MongolFlix');
  });

  it('видео хадгалах замыг зөвшөөрөгдсөн жагсаалтаас гадуур тавихгүй', async () => {
    const sup = await login('superadmin');
    const { body } = await sup.agent.get('/api/admin/settings');
    const res = await sup.agent.put('/api/admin/settings/video').send({ value: { ...body.video.value, storageRoot: '/etc' } });
    expect(res.status).toBe(400);
    const admin = await login('admin');
    expect((await admin.agent.put('/api/admin/settings/video').send({ value: { ...body.video.value, storageRoot: '/etc' } })).status).toBe(403);
  });

  it('зассан нүүр хуудас, сайтын нэр тэр дороо нийтэд харагдана (кэш цэвэрлэгдэнэ)', async () => {
    const admin = await login('admin');
    await api().get('/api/settings/public');
    const { body } = await admin.agent.get('/api/admin/settings');
    await admin.agent.put('/api/admin/settings/general').send({ value: { ...body.general.value, siteName: 'Шинэ нэр' } });
    expect((await api().get('/api/settings/public')).body.general.siteName).toBe('Шинэ нэр');
  });

  it('засварын горим хэрэглэгчийн хүсэлтийг хааж, админыг нэвтрүүлнэ', async () => {
    const admin = await login('admin');
    const { body } = await admin.agent.get('/api/admin/settings');
    await admin.agent.put('/api/admin/settings/general').send({ value: { ...body.general.value, maintenanceMode: true } });
    expect((await api().get('/api/movies')).status).toBe(503);
    expect((await admin.agent.get('/api/admin/dashboard')).status).toBe(200);
    expect((await api().get('/api/settings/public')).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ phone: '99112233', password: 'wrong-password' })).status).toBe(401);
    // Засварын үед төлбөрийн callback хаагдвал QPay дахин илгээдэггүй тул төлбөр алдагдана.
    expect((await api().get('/api/payments/qpay/callback?order=MFNOTEXISTING01')).status).toBe(404);
  });
});
