import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { env } from '../src/config/env';
import { AdminLog, Category, Movie, Payment, Subscription, User, VideoJob } from '../src/models';
import { VideoService } from '../src/services/video.service';
import { api, login, makeMovie, resetDb, startDb, stopDb } from './helpers';

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
  });

  it('видео байршуулалт дараалалд орж, HTTP хүсэлтэд FFmpeg ажиллахгүй', async () => {
    const m = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    const res = await agent.post(`/api/admin/movies/${m._id}/upload`).attach('video', Buffer.from('data'), { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(202);
    expect((await VideoJob.findById(res.body.jobId).lean())!.status).toBe('queued');
    expect((await Movie.findById(m._id).lean())!.videoStatus).toBe('queued');
    const bad = await agent.post(`/api/admin/movies/${m._id}/upload`).attach('video', Buffer.from('x'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);
  });

  it('видео файлын хэмжээний хязгаарыг тохиргооноос авна', async () => {
    const m = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('superadmin');
    const { body } = await agent.get('/api/admin/settings');
    await agent.put('/api/admin/settings/video').send({ value: { ...body.video.value, maxUploadSizeMb: 1 } });
    const res = await agent.post(`/api/admin/movies/${m._id}/upload`).attach('video', Buffer.alloc(1024 * 1024 + 10), { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });

  it('видео ажил эвдэрсэн файлаар амжилтгүй бол failed төлөвт орж, түр файл цэвэрлэгдэнэ', async () => {
    const m = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    await agent.post(`/api/admin/movies/${m._id}/upload`).attach('video', Buffer.from('not video'), { filename: 'a.mp4', contentType: 'video/mp4' });
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
    expect(ok.body.url).toMatch(/\/posters\/.+\.png$/);
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
    expect((await admin.agent.patch(`/api/admin/users/${t.user._id}/password`).send({ password: 'short' })).status).toBe(400);
    expect((await admin.agent.patch(`/api/admin/users/${t.user._id}/password`).send({ password: 'Fresh-pass-123' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ phone: t.phone, password: t.password })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ phone: t.phone, password: 'Fresh-pass-123' })).status).toBe(200);
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

  it('буцаалтыг зөвхөн superadmin бүртгэж, холбогдох эрх цуцлагдана', async () => {
    const { user } = await login();
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

  it('dashboard тоо зөв гаргана, кино хайлт ажиллана', async () => {
    const { agent } = await login('admin');
    await makeMovie({ title: 'Хайлтын гарчиг', viewCount: 5 });
    const d = await agent.get('/api/admin/dashboard');
    expect(d.body.totalUsers).toBe(1);
    expect(d.body.topMovies[0].viewCount).toBe(5);
    expect((await api().get(`/api/search?q=${encodeURIComponent('Хайлтын')}`)).body.total).toBe(1);
    expect((await api().get(`/api/search?q=${encodeURIComponent('Хайл')}`)).body.total).toBe(1);
    expect((await api().get('/api/search?q=' + encodeURIComponent('(.*)'))).body.total).toBe(0);
    expect(await Category.countDocuments()).toBe(1);
  });
});
