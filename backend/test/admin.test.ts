import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { env } from '../src/config/env';
import { AdminLog, Category, Movie, Payment, SiteVisit, Subscription, User, VideoJob } from '../src/models';
import { VideoService } from '../src/services/video.service';
import { visitDay, VisitService } from '../src/services/visit.service';
import { api, login, makeMovie, resetDb, startDb, stopDb, uploadVideo } from './helpers';

const movieBody = (over = {}) => ({ title: 'Шинэ кино', slug: 'shine-kino', description: 'тайлбар', isPublished: true, genres: [], cast: ['A'], ...over });

describe('Админ удирдлага', () => {
  beforeAll(startDb);
  afterAll(async () => { await fs.rm(env.VIDEO_DEFAULT_ROOT, { recursive: true, force: true }); await stopDb(); });
  beforeEach(resetDb);

  const adminPaths: [string, string][] = [
    ['get', '/api/admin/dashboard'], ['get', '/api/admin/users'], ['get', '/api/admin/movies'], ['post', '/api/admin/movies'],
    ['get', '/api/admin/payments'], ['get', '/api/admin/logs'], ['get', '/api/admin/settings'], ['put', '/api/admin/settings/subscription'],
    ['patch', '/api/admin/users/000000000000000000000000/password'],
  ];

  it('нэвтрээгүй болон энгийн хэрэглэгч бүх /admin API-д хаагдана', async () => {
    const { agent } = await login();
    for (const [method, url] of adminPaths) {
      expect((await (api() as any)[method](url)).status).toBe(401);
      expect((await (agent as any)[method](url)).status).toBe(403);
    }
  });

  it('админ кино нэмж, засаж, устгана; бүгд AdminLog-д бичигдэнэ', async () => {
    const { agent } = await login('admin');
    const created = await agent.post('/api/admin/movies').send(movieBody());
    expect(created.status).toBe(201);
    expect((await api().get('/api/movies/shine-kino')).status).toBe(200);
    const upd = await agent.put(`/api/admin/movies/${created.body.id}`).send(movieBody({ title: 'Зассан', isPublished: false }));
    expect(upd.body.title).toBe('Зассан');
    expect((await api().get('/api/movies/shine-kino')).status).toBe(404);
    expect((await agent.delete(`/api/admin/movies/${created.body.id}`)).status).toBe(200);
    expect(await Movie.countDocuments()).toBe(0);
    const actions = (await AdminLog.find().lean()).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['movie.create', 'movie.update', 'movie.delete']));
    // Админ имэйлээр нэвтэрдэг тул түүхэнд имэйлээр нь ялгагдана.
    const logs = await agent.get('/api/admin/logs');
    expect(logs.body.items[0].adminId.email).toContain('@example.com');
  });

  it('маягтад байхгүй талбарууд заавал биш, засахад хуучин киноны утгууд устахгүй', async () => {
    const { agent } = await login('admin');
    const minimal = { title: 'Богино кино', description: '', genres: [], isPublished: true, featured: false };
    const fresh = await agent.post('/api/admin/movies').send(minimal);
    expect(fresh.status).toBe(201);
    expect(fresh.body.cast).toEqual([]);
    const old = await makeMovie({ cast: ['Жүжигчин'], director: 'Найруулагч', releaseYear: 1999, duration: 5400, language: 'Монгол', country: 'Монгол' });
    const upd = await agent.put(`/api/admin/movies/${old._id}`).send({ ...minimal, title: 'Зассан' });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ title: 'Зассан', slug: old.slug, cast: ['Жүжигчин'], director: 'Найруулагч', releaseYear: 1999, duration: 5400, language: 'Монгол', country: 'Монгол' });
  });

  it('slug гарчгаас автоматаар үүсч, давхцвал дугаар авна', async () => {
    const { agent } = await login('admin');
    const create = async (title: string) => (await agent.post('/api/admin/movies').send({ title, description: '', genres: [], isPublished: true, featured: false })).body.slug;
    expect(await create('Шинэ цагаан сар!')).toBe('shine-tsagaan-sar');
    expect(await create('Шинэ цагаан сар')).toBe('shine-tsagaan-sar-2');
    expect(await create('Шинэ, цагаан сар')).toBe('shine-tsagaan-sar-3');
    expect(await create('Өвөл Үүр')).toBe('ovol-uur');
    expect(await create('Hello World 2')).toBe('hello-world-2');
    // Латин болж чадахгүй гарчиг ч кино нэмэхэд саад болохгүй.
    expect(await create('!!!')).toBe('kino');
    expect(await create('???')).toBe('kino-2');
    expect((await create('я'.repeat(200))).length).toBeLessThanOrEqual(100);
    expect((await api().get('/api/movies/shine-tsagaan-sar-2')).status).toBe(200);
  });

  it('гарчиг засахад slug солигдохгүй: тарсан холбоос ажилласаар байна', async () => {
    const { agent } = await login('admin');
    const body = { title: 'Анхны нэр', description: '', genres: [], isPublished: true, featured: false };
    const created = await agent.post('/api/admin/movies').send(body);
    const upd = await agent.put(`/api/admin/movies/${created.body.id}`).send({ ...body, title: 'Шинэ нэр' });
    expect(upd.body.title).toBe('Шинэ нэр');
    expect(upd.body.slug).toBe(created.body.slug);
    expect((await api().get(`/api/movies/${created.body.slug}`)).status).toBe(200);
  });

  it('видео байршуулалт дараалалд орж, HTTP хүсэлтэд FFmpeg ажиллахгүй', async () => {
    const m = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    const res = await uploadVideo(agent, m._id, Buffer.from('data'), 'a.mp4');
    expect(res.status).toBe(202);
    expect((await VideoJob.findById(res.body.jobId).lean())!.status).toBe('queued');
    expect((await Movie.findById(m._id).lean())!.videoStatus).toBe('queued');
    const bad = await uploadVideo(agent, m._id, Buffer.from('x'), 'a.exe');
    expect(bad.status).toBe(400);
  });

  it('видео ажил эвдэрсэн файлаар амжилтгүй бол failed төлөвт орж, түр файл цэвэрлэгдэнэ', async () => {
    const m = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    await uploadVideo(agent, m._id, Buffer.from('not video'), 'a.mp4');
    const job = (await VideoService.claimNext())!;
    expect(job.status).toBe('processing');
    await VideoService.process(job);
    expect((await Movie.findById(m._id).lean())!.videoStatus).toBe('failed');
    expect((await VideoJob.findById(job._id).lean())!.status).toBe('failed');
    await expect(fs.access(job.sourcePath)).rejects.toThrow();
  });

  it('зураг байршуулалт гарчиг биш агуулгаар шалгагдана', async () => {
    const m = await makeMovie();
    const { agent } = await login('admin');
    const fake = await agent.post(`/api/admin/movies/${m._id}/image?kind=poster`).attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'a.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const ok = await agent.post(`/api/admin/movies/${m._id}/image?kind=poster`).attach('image', png, { filename: 'b.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/^\/media\/posters\/.+\.png$/);
    // Бодит файл хадгалагдаж, тэр замаараа гарна
    const served = await api().get(ok.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');
    // Нийтийн API мөн ижил замыг өгнө
    expect((await api().get(`/api/movies/${m.slug}`)).body.poster).toBe(ok.body.url);
  });

  it('өмнө бүтэн хаягаар хадгалсан постер одоогийн домэйнд хүчинтэй зам болно', async () => {
    const m = await makeMovie({ poster: 'http://103.0.0.1/media/posters/a.png', backdrop: 'https://cdn.example.com/b.jpg' });
    const { body } = await api().get(`/api/movies/${m.slug}`);
    expect(body.poster).toBe('/media/posters/a.png');
    expect(body.backdrop).toBe('https://cdn.example.com/b.jpg');
  });

  it('админ эрхийг гараар сунгаж, лог үлдээнэ', async () => {
    const { agent } = await login('admin');
    const target = await login();
    const res = await agent.post(`/api/admin/subscriptions/${target.user._id}/extend`).send({ days: 7, note: 'Нөхөн олговор' });
    expect(res.status).toBe(201);
    expect(await Subscription.countDocuments({ userId: target.user._id, planCode: 'MANUAL' })).toBe(1);
    expect((await target.agent.get('/api/subscriptions/me')).body.hasAccess).toBe(true);
    const log = await AdminLog.findOne({ action: 'subscription.extend' }).lean();
    expect(log!.metadata.days).toBe(7);
    expect((await agent.post(`/api/admin/subscriptions/${target.user._id}/extend`).send({ days: 7 })).status).toBe(400);
  });

  it('хэрэглэгч блоклоход сешн нь хаагдана, админ өөрийгөө блоклохгүй', async () => {
    const admin = await login('admin');
    const t = await login();
    expect((await admin.agent.patch(`/api/admin/users/${t.user._id}/status`).send({ status: 'blocked' })).status).toBe(200);
    expect((await t.agent.get('/api/auth/me')).status).toBe(401);
    expect((await t.agent.post('/api/auth/refresh')).status).toBe(401);
    expect((await admin.agent.patch(`/api/admin/users/${admin.user._id}/status`).send({ status: 'blocked' })).status).toBe(400);
    const other = await login('admin');
    expect((await admin.agent.patch(`/api/admin/users/${other.user._id}/status`).send({ status: 'blocked' })).status).toBe(403);
  });

  it('админ мартсан нууц үгийг шинэчилж, сешн хаагдаж, түгжээ арилна', async () => {
    const admin = await login('admin');
    const t = await login();
    await User.updateOne({ _id: t.user._id }, { $set: { lockUntil: new Date(Date.now() + 1e7) } });
    expect((await t.agent.patch(`/api/admin/users/${t.user._id}/password`).send({ password: 'Other-pass-123' })).status).toBe(403);
    expect((await admin.agent.patch(`/api/admin/users/${t.user._id}/password`).send({ password: '' })).status).toBe(400);
    expect((await admin.agent.patch(`/api/admin/users/${t.user._id}/password`).send({ password: 'Fresh-pass-123' })).status).toBe(400);
    expect((await admin.agent.patch(`/api/admin/users/${t.user._id}/password`).send({ password: '9090' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ phone: t.phone, password: t.password })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ phone: t.phone, password: '9090' })).status).toBe(200);
    expect((await t.agent.post('/api/auth/refresh')).status).toBe(401);
    expect(await AdminLog.countDocuments({ action: 'user.password_reset' })).toBe(1);
    // Логт нууц үг бичигдэхгүй
    expect(JSON.stringify(await AdminLog.find().lean())).not.toContain('Fresh-pass-123');
  });

  it('админы нууц үгийг зөвхөн superadmin шинэчилнэ', async () => {
    const admin = await login('admin');
    const other = await login('admin');
    expect((await admin.agent.patch(`/api/admin/users/${other.user._id}/password`).send({ password: 'Fresh-pass-123' })).status).toBe(403);
    const sup = await login('superadmin');
    expect((await sup.agent.patch(`/api/admin/users/${other.user._id}/password`).send({ password: 'Fresh-pass-123' })).status).toBe(200);
  });

  it('админ удирдлага зөвхөн superadmin-д; сүүлчийн superadmin-г хасахгүй', async () => {
    const admin = await login('admin');
    expect((await admin.agent.post('/api/admin/admins').send({ email: 'new@example.com', phone: '99001122', password: 'Admin-pass-1234', role: 'admin' })).status).toBe(403);
    const sup = await login('superadmin');
    const created = await sup.agent.post('/api/admin/admins').send({ email: 'new@example.com', phone: '99001122', password: 'Admin-pass-1234', role: 'admin' });
    expect(created.status).toBe(201);
    expect((await User.findById(created.body.id).lean())!.role).toBe('admin');
    expect((await sup.agent.patch(`/api/admin/admins/${sup.user._id}/role`).send({ role: 'user' })).status).toBe(409);
    expect((await api().post('/api/auth/admin/login').send({ email: 'new@example.com', password: 'Admin-pass-1234' })).status).toBe(200);
    // Имэйлгүй хэрэглэгчийг админ болговол нэвтэрч чадахгүй тул хориглоно.
    const plain = await login();
    expect((await sup.agent.patch(`/api/admin/admins/${plain.user._id}/role`).send({ role: 'admin' })).status).toBe(400);
  });

  it('superadmin дээд тал нь 3 байна', async () => {
    const first = await login('superadmin');
    const add = (n: number) => first.agent.post('/api/admin/admins').send({ email: `s${n}@example.com`, phone: `9900110${n}`, password: 'pw', role: 'superadmin' });
    expect((await add(1)).status).toBe(201);
    expect((await add(2)).status).toBe(201);
    const over = await add(3);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('SUPERADMIN_LIMIT');
    expect(await User.countDocuments({ role: 'superadmin' })).toBe(3);

    // Эрх солих замаар ч хязгаарыг давахгүй
    const admin = await first.agent.post('/api/admin/admins').send({ email: 'a@example.com', phone: '99001109', password: 'pw', role: 'admin' });
    expect(admin.status).toBe(201);
    expect((await first.agent.patch(`/api/admin/admins/${admin.body.id}/role`).send({ role: 'superadmin' })).status).toBe(409);

    // Аль хэдийн superadmin бол дахин зааж болно, нэгийг буулгавал сул орон гарна
    expect((await first.agent.post('/api/admin/admins').send({ email: 's1@example.com', phone: '99001101', role: 'superadmin' })).status).toBe(201);
    const second = await User.findOne({ email: 's1@example.com' }).lean();
    expect((await first.agent.patch(`/api/admin/admins/${second!._id}/role`).send({ role: 'admin' })).status).toBe(200);
    expect((await first.agent.patch(`/api/admin/admins/${admin.body.id}/role`).send({ role: 'superadmin' })).status).toBe(200);
  });

  it('буцаалтыг зөвхөн superadmin бүртгэж, холбогдох эрх цуцлагдана', async () => {
    const { user } = await login();
    // fee-гүй хуучин төлбөр: үндсэн үнэ нь нийт дүнтэйгээ тэнцүү.
    const p = await Payment.create({ userId: user._id, orderNumber: 'MFTESTORDER01', amount: 14900, currency: 'MNT', planCode: 'MONTHLY', planName: 'С', durationDays: 30, pricingVersion: 1, qpayBaiguullagiinId: 'org-1', qpayBarilgiinId: 'branch-1', status: 'paid' });
    const sub = await Subscription.create({ seq: 1, userId: user._id, planCode: 'MONTHLY', amount: 14900, currency: 'MNT', status: 'active', startedAt: new Date(), expiresAt: new Date(Date.now() + 1e9), paymentId: p._id });
    await Payment.updateOne({ _id: p._id }, { $set: { subscriptionId: sub._id } });
    const admin = await login('admin');
    expect((await admin.agent.post(`/api/admin/payments/${p._id}/refund`).send({ note: 'x' })).status).toBe(403);
    const s = await login('superadmin');
    expect((await s.agent.post(`/api/admin/payments/${p._id}/refund`).send({ note: 'Хэрэглэгчийн хүсэлт' })).status).toBe(200);
    expect((await Subscription.findById(sub._id).lean())!.status).toBe('cancelled');
    expect((await Payment.findById(p._id).lean())!.status).toBe('refunded');
  });

  it('сайтын зочныг төхөөрөмжөөр нь давхардуулахгүй тоолно', async () => {
    const [a, b] = ['a'.repeat(32), 'b'.repeat(32)];
    const counts = async () => (await (await login('admin')).agent.get('/api/admin/dashboard')).body.visitors;
    expect(await counts()).toEqual({ today: 0, month: 0, total: 0 });

    // Нэвтрээгүй зочин тоологдоно. Өдөрт олон удаа, зэрэг орсон ч нэг л бичлэг.
    const sent = await Promise.all([a, a, a, b].map((visitorId) => api().post('/api/visits').send({ visitorId })));
    expect(sent.map((r) => r.status)).toEqual([204, 204, 204, 204]);
    expect(await SiteVisit.countDocuments()).toBe(2);
    expect(await counts()).toEqual({ today: 2, month: 2, total: 2 });

    // Буруу утга бүртгэгдэхгүй, хэн ч зочны тоог уншиж чадахгүй.
    const before = await SiteVisit.countDocuments();
    for (const body of [{}, { visitorId: 'x' }, { visitorId: { $ne: '' } }, { visitorId: 'A'.repeat(32) }]) {
      expect((await api().post('/api/visits').send(body)).status).toBe(400);
    }
    expect(await SiteVisit.countDocuments()).toBe(before);
    expect((await api().get('/api/admin/dashboard')).status).toBe(401);
  });

  it('өдөр, сар, нийт зочныг давхардуулахгүй тооцно', async () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((x) => x.repeat(32));
    await SiteVisit.create([
      { day: '2026-11-15', visitorId: a }, { day: '2026-11-15', visitorId: b },
      { day: '2026-11-14', visitorId: a }, { day: '2026-11-01', visitorId: c },
      { day: '2026-10-31', visitorId: a }, { day: '2026-10-31', visitorId: d },
    ]);
    expect(await VisitService.counts(new Date('2026-11-15T04:00:00Z'))).toEqual({ today: 2, month: 3, total: 4 });
    // Улаанбаатарын цагаар дараагийн сар эхэлсэн мөч.
    expect(await VisitService.counts(new Date('2026-11-30T16:00:00Z'))).toEqual({ today: 0, month: 0, total: 4 });
  });

  it('зочны өдрийг Улаанбаатарын цагаар тооцно', () => {
    expect(visitDay(new Date('2026-11-04T15:59:00Z'))).toBe('2026-11-04');
    expect(visitDay(new Date('2026-11-04T16:00:00Z'))).toBe('2026-11-05');
    expect(visitDay(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-01');
  });

  it('dashboard тоо зөв гаргана, кино хайлт ажиллана', async () => {
    const { agent } = await login('admin');
    await makeMovie({ title: 'Хайлтын гарчиг', viewCount: 5 });
    const d = await agent.get('/api/admin/dashboard');
    expect(d.body.totalUsers).toBe(1);
    expect(d.body.topMovies[0].viewCount).toBe(5);
    expect((await api().get(`/api/search?q=${encodeURIComponent('Хайлтын')}`)).body.total).toBe(1);
    expect((await api().get(`/api/search?q=${encodeURIComponent('Хайл')}`)).body.total).toBe(1);
    expect((await api().get('/api/search?q=' + encodeURIComponent('(.*)'))).body.total).toBe(0);
    // Хуудасны бүх хэмжээг (10, 20, 50, 100) зөвшөөрнө.
    expect((await api().get(`/api/search?q=${encodeURIComponent('Хайл')}&limit=100`)).status).toBe(200);
    expect(await Category.countDocuments()).toBe(1);
  });
});
