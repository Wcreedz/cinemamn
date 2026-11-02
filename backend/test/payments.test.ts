import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env';
import { Payment, Subscription } from '../src/models';
import { BAIGUULLAGIIN_ID, BARILGIIN_ID, parseCheckResponse } from '../src/services/qpay.gateway';
import { PaymentService } from '../src/services/payment.service';
import { SubscriptionService } from '../src/services/subscription.service';
import { api, FakeQPay, login, resetDb, seedMerchant, startDb, stopDb } from './helpers';

const qpay = new FakeQPay();
const DAY = 86_400_000;

const setup = seedMerchant;
async function newPayment() {
  const user = await login();
  const res = await user.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
  expect(res.status).toBe(201);
  const doc = (await Payment.findById(res.body.id).lean())!;
  return { user, res, doc };
}
const callback = (order: string) => api().get(`/api/qpaycallback/${BAIGUULLAGIIN_ID}/${order}`);

describe('QPay төлбөр (quickqpaypackv2 + тест сервер)', () => {
  beforeAll(async () => { await startDb(); await qpay.start(); });
  afterAll(async () => { await qpay.stop(); await stopDb(); });
  beforeEach(async () => { await resetDb(); qpay.reset(); });

  it('багцын харилцагчийн бүтцээр нэхэмжлэх үүсгэж QR буцаана', async () => {
    await setup();
    const { res, doc } = await newPayment();
    expect(res.body.amount).toBe(14900);
    expect(res.body.qr.image).toBe('QRIMG');
    expect(res.body.qr.urls[0].link).toBe('khanbank://q');
    const inv = qpay.invoices.get(doc.invoiceId!)!;
    expect(inv.amount).toBe(14900);
    expect(inv.merchantId).toBe('merchant-false');
    expect(inv.callback).toBe(`http://localhost:4100/api/qpaycallback/${BAIGUULLAGIIN_ID}/${doc.orderNumber}`);
    expect(doc.qpayBarilgiinId).toBe(BARILGIIN_ID);
  });

  it('фронтоос ирсэн дүн, төлөвт итгэхгүй', async () => {
    await setup();
    const user = await login();
    const res = await user.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY', amount: 1, currency: 'USD', status: 'paid' });
    expect(res.body.amount).toBe(14900);
    expect(res.body.currency).toBe('MNT');
    expect(res.body.status).toBe('pending');
  });

  it('төлөгдсөн callback QPay-с шалгаад 30 хоногийн эрх үүсгэнэ', async () => {
    await setup();
    const { user, doc } = await newPayment();
    qpay.markPaid(doc.invoiceId!);
    expect((await callback(doc.orderNumber)).body.outcome).toBe('paid');
    const me = await user.agent.get('/api/subscriptions/me');
    expect(me.body.hasAccess).toBe(true);
    expect(new Date(me.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(new Date(me.body.expiresAt).getTime()).toBeLessThan(Date.now() + 31 * DAY);
    expect((await Payment.findById(doc._id).lean())!.status).toBe('paid');
  });

  it('төлөгдөөгүй нэхэмжлэхийн callback эрх үүсгэхгүй (callback-д дангаар итгэхгүй)', async () => {
    await setup();
    const { doc } = await newPayment();
    expect((await callback(doc.orderNumber)).body.outcome).toBe('pending');
    expect(await Subscription.countDocuments()).toBe(0);
    expect((await Payment.findById(doc._id).lean())!.status).toBe('pending');
  });

  it('давхар callback хоёр дахь эрх үүсгэхгүй, зэрэгцээ ч нэг л удаа', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.markPaid(doc.invoiceId!);
    const results = await Promise.all([callback(doc.orderNumber), callback(doc.orderNumber), callback(doc.orderNumber), callback(doc.orderNumber)]);
    expect(results.map((r) => r.body.outcome).filter((o) => o === 'paid')).toHaveLength(1);
    await callback(doc.orderNumber);
    expect(await Subscription.countDocuments({ paymentId: doc._id })).toBe(1);
  });

  it('нэг хэрэглэгчийн зэрэгцээ хоёр төлбөр хугацаагаа алдахгүй дараалж нэмэгдэнэ', async () => {
    await setup();
    const user = await login();
    const a = await user.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
    const adminUser = await login('admin');
    const { body } = await adminUser.agent.get('/api/admin/settings');
    await adminUser.agent.put('/api/admin/settings/subscription').send({ value: { ...body.subscription.value, plans: [{ code: 'MONTHLY', name: 'Сарын эрх', price: 19900, durationDays: 30, enabled: true }] } });
    const b = await user.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
    const docs = await Payment.find({ _id: { $in: [a.body.id, b.body.id] } }).lean();
    expect(docs).toHaveLength(2);
    docs.forEach((d) => qpay.markPaid(d.invoiceId!));
    await Promise.all(docs.map((d) => callback(d.orderNumber)));
    const subs = await Subscription.find({ userId: user.user._id }).sort({ seq: 1 }).lean();
    expect(subs.map((s) => s.seq)).toEqual([1, 2]);
    expect(subs[1].startedAt.getTime()).toBe(subs[0].expiresAt.getTime());
    expect(new Date((await user.agent.get('/api/subscriptions/me')).body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  it('төлөв шинэчлэгдсэний дараа тасарвал worker эрхийг нөхнө, давтахад нэмэгдэхгүй', async () => {
    await setup();
    const { user, doc } = await newPayment();
    await Payment.updateOne({ _id: doc._id }, { $set: { status: 'paid', paidAt: new Date(), verifiedAt: new Date() } });
    expect(await Subscription.countDocuments()).toBe(0);
    expect((await user.agent.get('/api/subscriptions/me')).body.hasAccess).toBe(false);

    expect((await PaymentService.repairIncomplete()).activated).toBe(1);
    expect(await Subscription.countDocuments({ paymentId: doc._id })).toBe(1);
    expect((await user.agent.get('/api/subscriptions/me')).body.hasAccess).toBe(true);
    expect((await Payment.findById(doc._id).lean())!.subscriptionId).toBeTruthy();

    expect((await PaymentService.repairIncomplete()).activated).toBe(0);
    expect(await Subscription.countDocuments({ paymentId: doc._id })).toBe(1);
  });

  it('тасарсан төлбөрт давтан callback ирвэл эрхийг нөхнө', async () => {
    await setup();
    const { doc } = await newPayment();
    await Payment.updateOne({ _id: doc._id }, { $set: { status: 'paid', paidAt: new Date() } });
    expect((await callback(doc.orderNumber)).body.outcome).toBe('already_paid');
    expect(await Subscription.countDocuments({ paymentId: doc._id })).toBe(1);
  });

  it('буцаалтын дараа тасарвал worker эрхийг цуцална', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.markPaid(doc.invoiceId!);
    await callback(doc.orderNumber);
    await Payment.updateOne({ _id: doc._id }, { $set: { status: 'refunded' } });
    expect((await PaymentService.repairIncomplete()).cancelled).toBe(1);
    expect((await Subscription.findOne({ paymentId: doc._id }).lean())!.status).toBe('cancelled');
  });

  it('буруу дүнтэй төлбөр эрх үүсгэхгүй', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.markPaid(doc.invoiceId!, 100);
    expect((await callback(doc.orderNumber)).body.outcome).toBe('rejected');
    const p = (await Payment.findById(doc._id).lean())!;
    expect(p.status).toBe('failed');
    expect(p.failureReason).toBe('AMOUNT_MISMATCH');
    expect(await Subscription.countDocuments()).toBe(0);
  });

  it('буруу валют эрх үүсгэхгүй', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.markPaid(doc.invoiceId!, 14900, 'USD');
    expect((await callback(doc.orderNumber)).body.outcome).toBe('rejected');
    expect(await Subscription.countDocuments()).toBe(0);
  });

  it('QPay хариунд дүн байхгүй бол автоматаар идэвхжүүлэхгүй', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.checkOverride = (inv) => ({ id: inv?.id, invoice_status: 'PAID' });
    expect((await callback(doc.orderNumber)).body.outcome).toBe('unverifiable');
    expect(await Subscription.countDocuments()).toBe(0);
  });

  it('өөр нэхэмжлэхийн хариу ирвэл татгалзана', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.checkOverride = () => ({ id: 'other-invoice', invoice_status: 'PAID', payments: [{ amount: 14900, currency: 'MNT' }] });
    expect((await callback(doc.orderNumber)).body.outcome).toBe('rejected');
    expect(await Subscription.countDocuments()).toBe(0);
  });

  it('идэвхтэй эрхийг дуусах огнооноос нь сунгана; дууссан бол төлбөрийн агшнаас', async () => {
    await setup();
    const { user, doc } = await newPayment();
    const existing = new Date(Date.now() + 10 * DAY);
    await Subscription.create({ seq: 1, userId: user.user._id, planCode: 'MONTHLY', amount: 1, currency: 'MNT', status: 'active', startedAt: new Date(Date.now() - DAY), expiresAt: existing });
    qpay.markPaid(doc.invoiceId!);
    await callback(doc.orderNumber);
    const sub = await Subscription.findOne({ paymentId: doc._id }).lean();
    expect(sub!.startedAt.getTime()).toBe(existing.getTime());
    expect(sub!.expiresAt.getTime()).toBe(existing.getTime() + 30 * DAY);

    const other = await newPayment();
    await Subscription.create({ seq: 1, userId: other.user.user._id, planCode: 'MONTHLY', amount: 1, currency: 'MNT', status: 'active', startedAt: new Date(Date.now() - 40 * DAY), expiresAt: new Date(Date.now() - 10 * DAY) });
    qpay.markPaid(other.doc.invoiceId!);
    await callback(other.doc.orderNumber);
    const fresh = await Subscription.findOne({ paymentId: other.doc._id }).lean();
    expect(Math.abs(fresh!.startedAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('эрхийн хугацаа дуусмагц хандалтгүй болно, job status-г шинэчилнэ', async () => {
    const { user } = await login().then((user) => ({ user }));
    await Subscription.create({ seq: 1, userId: user.user._id, planCode: 'M', amount: 1, currency: 'MNT', status: 'active', startedAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - 1000) });
    expect(await SubscriptionService.hasAccess(user.user._id)).toBe(false);
    expect(await SubscriptionService.expireDue()).toBe(1);
    expect((await Subscription.findOne({ userId: user.user._id }).lean())!.status).toBe('expired');
  });

  it('QPay тохиргоо дутуу бол нэхэмжлэх үүсгэхгүй, төлбөрийн бичлэг ч үлдэхгүй', async () => {
    await setup();
    const saved = env.UNDSEN_SERVER;
    env.UNDSEN_SERVER = undefined;
    try {
      const u = await login();
      const res = await u.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('QPAY_NOT_CONFIGURED');
      expect(qpay.invoices.size).toBe(0);
      expect(await Payment.countDocuments()).toBe(0);
    } finally {
      env.UNDSEN_SERVER = saved;
    }
  });

  it('өөр байгууллагын хаягаар ирсэн callback төлбөр хөндөхгүй', async () => {
    await setup();
    const { doc } = await newPayment();
    qpay.markPaid(doc.invoiceId!);
    expect((await api().get(`/api/qpaycallback/other-org/${doc.orderNumber}`)).status).toBe(404);
    expect(await Subscription.countDocuments()).toBe(0);
  });

  it('баазад харилцагч байхгүй бол төлбөр failed болж шалтгаан нь админд харагдана', async () => {
    const u = await login();
    const res = await u.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
    expect(res.status).toBe(502);
    const p = (await Payment.findOne({ userId: u.user._id }).lean())!;
    expect(p.status).toBe('failed');
    expect(p.verificationNote).toContain('олдсонгүй');
  });

  it('бүртгэлтэй merchant-ийг шинээр бүртгэхгүй, merchant_idFalse-аар нэхэмжлэх үүсгэнэ', async () => {
    await setup();
    const { doc } = await newPayment();
    expect(qpay.invoices.get(doc.invoiceId!)!.merchantId).toBe('merchant-false');
    expect(qpay.merchantRequests).toBe(0);
  });

  it('QPay алдаа буцаавал төлбөр failed болж эрх үүсэхгүй', async () => {
    await setup();
    await mongoose.connection.db.collection('token').deleteMany({});
    qpay.rejectAuth = true;
    const u = await login();
    const res = await u.agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' });
    expect(res.status).toBe(502);
    expect((await Payment.findOne({ userId: u.user._id }).lean())!.failureReason).toBe('INVOICE_CREATE_FAILED');
  });

  it('хүсэлт бусдын төлбөрийг харж чадахгүй', async () => {
    await setup();
    const { res } = await newPayment();
    const other = await login();
    expect((await other.agent.get(`/api/payments/${res.body.id}`)).status).toBe(404);
  });

  it('нэхэмжлэхийн дүн өөрчлөгдөхгүй (immutable)', async () => {
    await setup();
    const { doc } = await newPayment();
    await Payment.updateOne({ _id: doc._id }, { $set: { amount: 1, qpayBaiguullagiinId: 'other' } });
    const after = (await Payment.findById(doc._id).lean())!;
    expect(after.amount).toBe(14900);
    expect(after.qpayBaiguullagiinId).toBe(BAIGUULLAGIIN_ID);
  });

  it('хугацаа дууссан нэхэмжлэхийг төлсөн бол бодит төлбөрийг хүлээн авна', async () => {
    await setup();
    const { doc } = await newPayment();
    await Payment.updateOne({ _id: doc._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await PaymentService.expirePending()).toBe(1);
    qpay.markPaid(doc.invoiceId!);
    expect((await callback(doc.orderNumber)).body.outcome).toBe('paid');
  });

  it('quickqr.qpay.mn-ийн бодит хариу: SUCCESS мөр, "100.00" дүн таарвал төлсөнд тооцно', () => {
    const real = {
      id: '57630cb9-2193-46fe-9f1d-18cc8f9475bf', invoice_status: 'PAID', invoice_status_date: '2026-11-02T16:37:13.723Z',
      payments: [{
        id: '147127873368202', terminal_id: '95000059', amount: '100.00', currency: 'MNT', payment_name: 'Нэхэмжлэл',
        paid_by: 'P2P', note: null, payment_status: 'SUCCESS', payment_status_date: '2026-11-02T16:37:13.719Z', transactions: [],
      }],
    };
    const r = parseCheckResponse(real);
    expect(r.status).toBe('PAID');
    expect(r.amount).toBe(100);
    expect(r.currency).toBe('MNT');
    expect(r.paymentId).toBe('147127873368202');
    expect(r.invoiceId).toBe(real.id);
  });

  it('амжилтгүй төлөлтийн мөрийг дүнд тооцохгүй', () => {
    const r = parseCheckResponse({ invoice_status: 'OPEN', payments: [{ amount: '100.00', currency: 'MNT', payment_status: 'FAILED' }] });
    expect(r.amount).toBeNull();
    const partial = parseCheckResponse({ invoice_status: 'PAID', payments: [{ amount: '100.00', payment_status: 'SUCCESS' }, { amount: '50.00', payment_status: 'FAILED' }] });
    expect(partial.amount).toBe(100);
  });

  it('төлөгдсөний дараа сангийн QuickQpayObject tulsunEsekh true болж, payment_id хадгалагдана', async () => {
    await setup();
    const { doc } = await newPayment();
    const objects = () => mongoose.connection.db.collection('QuickQpayObject').findOne({ invoice_id: doc.invoiceId });
    for (let i = 0; i < 20 && !(await objects()); i++) await new Promise((r) => setTimeout(r, 25));
    expect((await objects())!.tulsunEsekh).toBe(false);
    qpay.markPaid(doc.invoiceId!);
    expect((await callback(doc.orderNumber)).body.outcome).toBe('paid');
    const after = (await objects())!;
    expect(after.tulsunEsekh).toBe(true);
    expect(after.payment_id).toBe('pay-1');
    expect((await Payment.findById(doc._id).lean())!.paymentId).toBe('pay-1');
  });

  it('parseCheckResponse: нэхэмжлэхийн дүн биш, төлөлтийн мөрийг эх сурвалж болгоно', () => {
    expect(parseCheckResponse({ invoice_status: 'PAID', amount: 14900, payments: [{ payment_status: 'PAID', payment_amount: 100 }] }).amount).toBe(100);
    expect(parseCheckResponse({ invoice_status: 'PAID', paid_amount: '14900' }).amount).toBe(14900);
    expect(parseCheckResponse({ invoice_status: 'PAID' }).amount).toBeNull();
  });

  it('салбарын ID кодод солигдсон ч хуучин нэхэмжлэх үүссэн салбараараа шалгагдана', async () => {
    await setup();
    const { doc } = await newPayment();
    await mongoose.connection.db.collection('payments').updateOne({ _id: doc._id }, { $set: { qpayBarilgiinId: 'previous-branch' } });
    qpay.markPaid(doc.invoiceId!);
    expect((await callback(doc.orderNumber)).body.outcome).toBe('paid');
  });

  it('устсан салбарын нэхэмжлэхийг шалгаж чадахгүй бол эрх үүсгэхгүй', async () => {
    await setup();
    const { doc } = await newPayment();
    await mongoose.connection.db.collection('payments').updateOne({ _id: doc._id }, { $set: { qpayBarilgiinId: 'missing-branch' } });
    qpay.markPaid(doc.invoiceId!);
    expect((await callback(doc.orderNumber)).status).toBe(502);
    expect(await Subscription.countDocuments()).toBe(0);
  });
});
