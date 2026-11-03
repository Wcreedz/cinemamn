import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { Movie, PlaybackSession, Subscription, User, WatchHistory } from '../src/models';
import { VideoConfigurationService } from '../src/services/videoConfiguration.service';
import { api, login, makeMovie, resetDb, startDb, stopDb } from './helpers';

const DAY = 86_400_000;
const activeSub = (userId: unknown, over = {}) => Subscription.create({ seq: 1, userId, planCode: 'MONTHLY', amount: 14900, currency: 'MNT', status: 'active', startedAt: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + DAY), ...over });

async function placeHls(movieId: string) {
  const { storageRoot } = await VideoConfigurationService.get();
  const dir = path.join(VideoConfigurationService.dirs(storageRoot).hls, movieId);
  await fs.mkdir(path.join(dir, '720p'), { recursive: true });
  await fs.writeFile(path.join(dir, 'master.m3u8'), '#EXTM3U\n720p/index.m3u8\n');
  await fs.writeFile(path.join(dir, '720p', 'seg_00000.ts'), 'segment');
}
const urlPath = (u: string) => new URL(u).pathname;

describe('Хамгаалалттай тоглуулалт', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(resetDb);
  afterEach(async () => { await fs.rm(env.VIDEO_DEFAULT_ROOT, { recursive: true, force: true }); });

  const playable = (items: { id: string; playable: boolean }[], id: unknown) => items.find((i) => i.id === String(id))?.playable;

  it('жагсаалт бүрт зөвхөн бүрэн боловсруулагдсан кино playable, дотоод зам задрахгүй', async () => {
    const ready = await makeMovie({ title: 'Хайх кино бэлэн', videoStatus: 'ready', hlsPath: 'hls/a', featured: true });
    const waiting = await Promise.all((['none', 'uploading', 'queued', 'processing', 'failed'] as const).map((videoStatus) => makeMovie({ title: 'Хайх кино ' + videoStatus, videoStatus, featured: true })));
    // Файл солигдож буй кино хуучин HLS-ээрээ үзэгдсээр байна.
    const replacing = await makeMovie({ title: 'Хайх кино солигдож буй', videoStatus: 'processing', hlsPath: 'hls/b', featured: true });
    for (const url of ['/api/movies?limit=50', '/api/movies/featured', '/api/movies/new', '/api/movies/popular', '/api/search?q=' + encodeURIComponent('Хайх')]) {
      const { items } = (await api().get(url)).body;
      expect(playable(items, ready._id)).toBe(true);
      expect(playable(items, replacing._id)).toBe(true);
      for (const m of waiting) expect(playable(items, m._id)).toBe(false);
      expect(JSON.stringify(items)).not.toContain('hls/');
    }
  });

  it('үзсэн түүхэд төлөв зөв, боловсруулагдаагүй киног эрхтэй ч үзэж болохгүй', async () => {
    const replacing = await makeMovie({ videoStatus: 'processing', hlsPath: 'hls/b' });
    const waiting = await makeMovie({ videoStatus: 'queued' });
    const { agent, user } = await login();
    await activeSub(user._id);
    await agent.put('/api/watch-history/' + replacing._id).send({ progressSeconds: 10, durationSeconds: 100 });
    await agent.put('/api/watch-history/' + waiting._id).send({ progressSeconds: 10, durationSeconds: 100 });
    const history = (await agent.get('/api/watch-history')).body.items.map((i: { movie: { id: string; playable: boolean } }) => i.movie);
    expect(playable(history, replacing._id)).toBe(true);
    expect(playable(history, waiting._id)).toBe(false);
    expect(JSON.stringify(history)).not.toContain('hls/');
    const denied = await agent.post('/api/stream/' + waiting._id + '/token');
    expect([denied.status, denied.body.error.code]).toEqual([409, 'VIDEO_NOT_READY']);
    expect(denied.body.error.message).toContain('Тун удахгүй');
  });

  it('нэвтрээгүй хэрэглэгч токен авч чадахгүй', async () => {
    const m = await makeMovie();
    expect((await api().post(`/api/stream/${m._id}/token`)).status).toBe(401);
  });

  it('эрхгүй хэрэглэгч үзэж чадахгүй', async () => {
    const m = await makeMovie();
    const { agent } = await login();
    const res = await agent.post(`/api/stream/${m._id}/token`);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('эрхтэй хэрэглэгч манифест, сегмент авна; эх файлын зам задрахгүй', async () => {
    const m = await makeMovie({ videoSource: '/secret/original.mp4', hlsPath: 'hls/x' });
    await placeHls(String(m._id));
    const { agent, user } = await login();
    await activeSub(user._id);
    const res = await agent.post(`/api/stream/${m._id}/token`);
    expect(res.status).toBe(200);
    const p = urlPath(res.body.manifestUrl);
    const manifest = await api().get(p);
    expect(manifest.status).toBe(200);
    expect(manifest.text).toContain('#EXTM3U');
    const seg = await api().get(p.replace('master.m3u8', '720p/seg_00000.ts'));
    expect(seg.status).toBe(200);
    const detail = await api().get(`/api/movies/${m.slug}`);
    expect(JSON.stringify(detail.body)).not.toContain('secret');
    expect(JSON.stringify(detail.body)).not.toContain('hls/x');
  });

  it('хугацаа дууссан эрхтэй хэрэглэгчид татгалзана, токен авсан ч сегмент хаагдана', async () => {
    const m = await makeMovie();
    await placeHls(String(m._id));
    const { agent, user } = await login();
    await activeSub(user._id, { expiresAt: new Date(Date.now() - 1000) });
    expect((await agent.post(`/api/stream/${m._id}/token`)).status).toBe(402);

    await Subscription.updateOne({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() + DAY) } });
    const ok = await agent.post(`/api/stream/${m._id}/token`);
    const p = urlPath(ok.body.manifestUrl);
    expect((await api().get(p)).status).toBe(200);
    await Subscription.updateOne({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api().get(p)).status).toBe(403);
  });

  it('хугацаа дууссан токенийг татгалзана', async () => {
    const m = await makeMovie();
    await placeHls(String(m._id));
    const { user } = await login();
    await activeSub(user._id);
    const s = await PlaybackSession.create({ userId: user._id, movieId: m._id, expiresAt: new Date() });
    const expired = jwt.sign({ sub: String(user._id), mid: String(m._id), sid: String(s._id), exp: Math.floor(Date.now() / 1000) - 10, aud: 'playback' }, env.PLAYBACK_TOKEN_SECRET);
    expect((await api().get(`/v/${expired}/${m._id}/master.m3u8`)).status).toBe(403);
  });

  it('токен өөр кинонд, хуурамч гарын үсэгтэй, зам солих оролдлогод хүчингүй', async () => {
    const m = await makeMovie();
    const other = await makeMovie();
    await placeHls(String(m._id));
    await placeHls(String(other._id));
    const { agent, user } = await login();
    await activeSub(user._id);
    const ok = await agent.post(`/api/stream/${m._id}/token`);
    const token = urlPath(ok.body.manifestUrl).split('/')[2];
    expect((await api().get(`/v/${token}/${other._id}/master.m3u8`)).status).toBe(403);
    const forged = jwt.sign({ sub: String(user._id), mid: String(m._id), sid: 'x', aud: 'playback' }, 'wrong-secret-wrong-secret-wrong-secret');
    expect((await api().get(`/v/${forged}/${m._id}/master.m3u8`)).status).toBe(403);
    expect((await api().get(`/v/${token}/${m._id}/..%2F..%2Fsecret.txt`)).status).toBe(404);
    expect((await api().get(`/v/${token}/${m._id}/original.mp4`)).status).toBe(404);
  });

  it('нийтлэгдээгүй кино, блоклогдсон хэрэглэгч хаагдана', async () => {
    const m = await makeMovie({ isPublished: false });
    const { agent, user } = await login();
    await activeSub(user._id);
    expect((await agent.post(`/api/stream/${m._id}/token`)).status).toBe(404);
    await Movie.updateOne({ _id: m._id }, { $set: { isPublished: true } });
    const ok = await agent.post(`/api/stream/${m._id}/token`);
    await placeHls(String(m._id));
    const p = urlPath(ok.body.manifestUrl);
    expect((await api().get(p)).status).toBe(200);
    await User.updateOne({ _id: user._id }, { $set: { status: 'blocked' } });
    expect((await api().get(p)).status).toBe(403);
  });

  it('Nginx auth_request endpoint нууц толгой шаардаж, зөв шийдвэр буцаана', async () => {
    const m = await makeMovie();
    const { agent, user } = await login();
    await activeSub(user._id);
    const ok = await agent.post(`/api/stream/${m._id}/token`);
    const uri = urlPath(ok.body.manifestUrl);
    expect((await api().get('/internal/stream/verify').set('X-Original-URI', uri)).status).toBe(403);
    const secret = process.env.INTERNAL_AUTH_SECRET!;
    expect((await api().get('/internal/stream/verify').set('X-Internal-Secret', secret).set('X-Original-URI', uri)).status).toBe(204);
    expect((await api().get('/internal/stream/verify').set('X-Internal-Secret', secret).set('X-Original-URI', '/v/bad/token')).status).toBe(403);
  });

  it('үзсэн явц хадгалагдаж, дараагийн токенд үргэлжлэх байрлал ирнэ', async () => {
    const m = await makeMovie();
    const { agent, user } = await login();
    await activeSub(user._id);
    expect((await agent.put(`/api/watch-history/${m._id}`).send({ progressSeconds: 120, durationSeconds: 3600 })).status).toBe(200);
    expect((await agent.post(`/api/stream/${m._id}/token`)).body.resumeSeconds).toBe(120);
    expect((await agent.get('/api/watch-history')).body.items[0].movie.title).toBe('Туршилтын кино');
    await agent.put(`/api/watch-history/${m._id}`).send({ progressSeconds: 3500, durationSeconds: 3600 });
    expect((await WatchHistory.findOne({ userId: user._id }).lean())!.completed).toBe(true);
  });

  it('төлбөр шаардлагагүй горимд нэвтэрсэн хэрэглэгч үзэж чадна', async () => {
    const m = await makeMovie();
    const adminUser = await login('admin');
    const { body } = await adminUser.agent.get('/api/admin/settings');
    await adminUser.agent.put('/api/admin/settings/subscription').send({ value: { ...body.subscription.value, paymentRequired: false } });
    const { agent } = await login();
    expect((await agent.post(`/api/stream/${m._id}/token`)).status).toBe(200);
  });
});
