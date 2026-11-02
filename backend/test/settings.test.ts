import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminLog, Payment, Subscription } from '../src/models';
import { BAIGUULLAGIIN_ID } from '../src/services/qpay.gateway';
import { api, FakeQPay, login, resetDb, seedMerchant, startDb, stopDb } from './helpers';

const qpay = new FakeQPay();
const monthly = (price: number) => ({
  value: { enabled: true, paymentRequired: true, currency: 'MNT', paymentExpiryMinutes: 60, plans: [{ code: 'MONTHLY', name: 'Сарын эрх', price, durationDays: 30, enabled: true }] },
});

describe('Админ тохиргоо', () => {
  beforeAll(async () => { await startDb(); await qpay.start(); });
  afterAll(async () => { await qpay.stop(); await stopDb(); });
  beforeEach(async () => { await resetDb(); qpay.reset(); });

  it('үнэ 14,900 -> 19,900: шинэ нэхэмжлэх шинэ үнэтэй, хуучин нь болон эрх өөрчлөгдөхгүй', async () => {
    await seedMerchant();
    const admin = await login('admin');

    expect((await api().get('/api/subscriptions/plans')).body.plans[0].price).toBe(14900);
    const buyer = await login();
    const oldInv = await buyer.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
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
    const newInv = await buyer.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
    expect(newInv.body.amount).toBe(19900);
    expect(newInv.body.id).not.toBe(oldInv.body.id);
    expect(qpay.invoices.get((await Payment.findById(newInv.body.id).lean())!.invoiceId!)!.amount).toBe(19900);
    // Хуучин нэхэмжлэх 14,900 хэвээр, 14,900-аар төлөгдвөл амжилттай
    const reread = (await Payment.findById(oldInv.body.id).lean())!;
    expect(reread.amount).toBe(14900);
    expect(reread.pricingVersion).toBe(oldDoc.pricingVersion);
    qpay.markPaid(reread.invoiceId!);
    expect((await api().get(`/api/qpaycallback/${BAIGUULLAGIIN_ID}/${reread.orderNumber}`)).body.outcome).toBe('paid');
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

  it('QPay тохиргооны замууд байхгүй', async () => {
    const { agent } = await login('superadmin');
    for (const url of ['/api/admin/settings/qpay', '/api/admin/settings/qpay/merchant']) {
      expect((await agent.get(url)).status).toBe(404);
      expect((await agent.post(url).send({})).status).toBe(404);
    }
  });

  it('нийтийн тохиргоо нууц мэдээлэл задруулахгүй', async () => {
    await seedMerchant();
    const res = await api().get('/api/settings/public');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const leak of ['baiguullagiinId', 'storageRoot', 'allowedAdminIps', BAIGUULLAGIIN_ID, 'secret']) expect(text).not.toContain(leak);
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
    expect((await api().get(`/api/qpaycallback/${BAIGUULLAGIIN_ID}/MFNOTEXISTING01`)).status).toBe(404);
  });
});
