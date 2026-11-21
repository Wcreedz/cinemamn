import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Payment, Subscription } from '../src/models';
import { BAIGUULLAGIIN_ID } from '../src/services/qpay.gateway';
import { api, FakeQPay, login, makeMovie, resetDb, seedMerchant, settleQPayWrites, startDb, stopDb } from './helpers';

const qpay = new FakeQPay();
const DAY = 86_400_000;
const callback = (order: string) => api().get(`/api/qpaycallback/${BAIGUULLAGIIN_ID}/${order}`);

type Agent = Awaited<ReturnType<typeof login>>['agent'];
async function buyMovie(agent: Agent, movieId: unknown) {
  const res = await agent.post('/api/qpayGargaya').send({ movieId: String(movieId) });
  expect(res.status).toBe(201);
  const doc = (await Payment.findById(res.body.id).lean())!;
  qpay.markPaid(doc.invoiceId!);
  expect((await callback(doc.orderNumber)).body.outcome).toBe('paid');
  return (await Subscription.findOne({ paymentId: doc._id }).lean())!;
}

describe('Нэг киноны эрх', () => {
  beforeAll(async () => { await startDb(); await qpay.start(); });
  afterAll(async () => { await qpay.stop(); await stopDb(); });
  beforeEach(async () => { await resetDb(); qpay.reset(); await seedMerchant(); });
  afterEach(() => settleQPayWrites(qpay));

  it('админ киноны үнэ, хугацааг оруулж, сайтад харагдана; 0 бол тусад нь зарагдахгүй', async () => {
    const admin = await login('admin');
    const m = await makeMovie();
    const put = await admin.agent.put(`/api/admin/movies/${m._id}`).send({ title: m.title, isPublished: true, rentalPrice: 3000, rentalDays: 3 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ rentalPrice: 3000, rentalDays: 3 });
    expect((await api().get(`/api/movies/${m.slug}`)).body).toMatchObject({ rentalPrice: 3000, rentalDays: 3 });

    // Үнэ заагаагүй засвар хуучин үнийг арилгахгүй.
    await admin.agent.put(`/api/admin/movies/${m._id}`).send({ title: 'Шинэ нэр', isPublished: true });
    expect((await api().get(`/api/movies/${m.slug}`)).body.rentalPrice).toBe(3000);

    expect((await admin.agent.put(`/api/admin/movies/${m._id}`).send({ title: m.title, rentalPrice: 10.5 })).status).toBe(400);
    expect((await admin.agent.put(`/api/admin/movies/${m._id}`).send({ title: m.title, rentalPrice: -1 })).status).toBe(400);

    await admin.agent.put(`/api/admin/movies/${m._id}`).send({ title: m.title, isPublished: true, rentalPrice: 0 });
    expect((await api().get(`/api/movies/${m.slug}`)).body.rentalPrice).toBeUndefined();
    const buyer = await login();
    expect((await buyer.agent.post('/api/qpayGargaya').send({ movieId: String(m._id) })).status).toBe(400);
  });

  it('үнийг серверт киноноос тооцож, төлөгдвөл зөвхөн тэр кино үзэгдэнэ', async () => {
    const bought = await makeMovie({ rentalPrice: 3000, rentalDays: 2 });
    const other = await makeMovie({ rentalPrice: 3000 });
    const { agent } = await login();

    const res = await agent.post('/api/qpayGargaya').send({ movieId: String(bought._id), amount: 1, planCode: 'MONTHLY' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: 3030, fee: 30, price: 3000, planCode: 'MOVIE', movieId: String(bought._id) });
    expect(qpay.invoices.get((await Payment.findById(res.body.id).lean())!.invoiceId!)!.amount).toBe(3030);

    const sub = await buyMovie(agent, bought._id);
    expect(String(sub.movieId)).toBe(String(bought._id));
    expect(sub.amount).toBe(3000);
    expect(sub.expiresAt.getTime() - sub.startedAt.getTime()).toBe(2 * DAY);

    const me = (await agent.get('/api/subscriptions/me')).body;
    expect(me.hasAccess).toBe(false);
    expect(me.movies).toEqual([{ movieId: String(bought._id), expiresAt: sub.expiresAt.toISOString() }]);

    expect((await agent.post(`/api/stream/${bought._id}/token`)).status).toBe(200);
    const denied = await agent.post(`/api/stream/${other._id}/token`);
    expect([denied.status, denied.body.error.code]).toEqual([402, 'SUBSCRIPTION_REQUIRED']);
  });

  it('сунгалт тухайн киноны эрхийн дуусах огнооноос үргэлжилж, сарын эрхтэй холилдохгүй', async () => {
    const m = await makeMovie({ rentalPrice: 2000, rentalDays: 3 });
    const { agent, user } = await login();
    const monthEnd = new Date(Date.now() + 20 * DAY);
    await Subscription.create({ seq: 1, userId: user._id, planCode: 'MONTHLY', amount: 1, currency: 'MNT', status: 'active', startedAt: new Date(Date.now() - DAY), expiresAt: monthEnd });

    // Сарын эрх идэвхтэй байсан ч киноны эрх өнөөдрөөс эхэлнэ.
    const first = await buyMovie(agent, m._id);
    expect(Math.abs(first.startedAt.getTime() - Date.now())).toBeLessThan(60_000);
    const second = await buyMovie(agent, m._id);
    expect(second.startedAt.getTime()).toBe(first.expiresAt.getTime());
    expect(second.expiresAt.getTime()).toBe(first.expiresAt.getTime() + 3 * DAY);
    expect((await agent.get('/api/subscriptions/me')).body.movies[0].expiresAt).toBe(second.expiresAt.toISOString());
    expect((await agent.get('/api/subscriptions/me')).body.expiresAt).toBe(monthEnd.toISOString());
  });

  it('хүлээгдэж буй нэхэмжлэхийг тухайн кинонд л дахин ашиглана', async () => {
    const a = await makeMovie({ rentalPrice: 2000 });
    const b = await makeMovie({ rentalPrice: 2000 });
    const { agent } = await login();
    const sub = (await agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' })).body;
    const first = (await agent.post('/api/qpayGargaya').send({ movieId: String(a._id) })).body;
    expect(first.id).not.toBe(sub.id);
    expect((await agent.post('/api/qpayGargaya').send({ movieId: String(a._id) })).body.id).toBe(first.id);
    expect((await agent.post('/api/qpayGargaya').send({ movieId: String(b._id) })).body.id).not.toBe(first.id);
    expect((await agent.post('/api/qpayGargaya').send({ planCode: 'MONTHLY' })).body.id).toBe(sub.id);
  });

  it('нийтлэгдээгүй, видео бэлэн бус кинонд нэхэмжлэх үүсэхгүй', async () => {
    const draft = await makeMovie({ rentalPrice: 2000, isPublished: false });
    const waiting = await makeMovie({ rentalPrice: 2000, videoStatus: 'processing' });
    const { agent } = await login();
    expect((await agent.post('/api/qpayGargaya').send({ movieId: String(draft._id) })).status).toBe(404);
    expect((await agent.post('/api/qpayGargaya').send({ movieId: String(waiting._id) })).status).toBe(409);
    expect((await agent.post('/api/qpayGargaya').send({ movieId: 'not-an-id' })).status).toBe(400);
    expect(await Payment.countDocuments()).toBe(0);
  });

  it('буцаалт бүртгэгдвэл киноны эрх цуцлагдана', async () => {
    const m = await makeMovie({ rentalPrice: 2000 });
    const { agent } = await login();
    const sub = await buyMovie(agent, m._id);
    const superadmin = await login('superadmin');
    expect((await superadmin.agent.post(`/api/admin/payments/${sub.paymentId}/refund`).send({ note: 'буцаав' })).status).toBe(200);
    expect((await agent.post(`/api/stream/${m._id}/token`)).status).toBe(402);
    expect((await agent.get('/api/subscriptions/me')).body.movies).toEqual([]);

    // Админы жагсаалтад киноны нэр харагдаж, захиалагчийн тоонд орохгүй.
    const list = (await superadmin.agent.get('/api/admin/subscriptions')).body.items;
    expect(list[0]).toMatchObject({ planCode: 'MOVIE', movieId: String(m._id), movieTitle: m.title });
    expect((await superadmin.agent.get('/api/admin/dashboard')).body.activeSubscribers).toBe(0);
  });

  it('багцын кодод системийн MOVIE кодыг ашиглахгүй', async () => {
    const admin = await login('admin');
    const { body } = await admin.agent.get('/api/admin/settings');
    const res = await admin.agent.put('/api/admin/settings/subscription').send({ value: { ...body.subscription.value, plans: [{ code: 'MOVIE', name: 'x', price: 100, durationDays: 1, enabled: true }] } });
    expect(res.status).toBe(400);
  });
});
