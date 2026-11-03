import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { env } from '../src/config/env';
import { Movie, Subscription, VideoJob } from '../src/models';
import { VideoService } from '../src/services/video.service';
import { api, login, makeMovie, resetDb, startDb, stopDb, uploadVideo } from './helpers';

const run = promisify(execFile);

describe('Видео: байршуулалтаас тоглуулалт хүртэл (жинхэнэ FFmpeg)', () => {
  let sample: Buffer;
  beforeAll(async () => {
    await startDb();
    await fs.mkdir(env.VIDEO_DEFAULT_ROOT, { recursive: true });
    const file = path.join(env.VIDEO_DEFAULT_ROOT, 'sample.mp4');
    await run(env.FFMPEG_PATH, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=10:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', file]);
    sample = await fs.readFile(file);
  });
  afterAll(async () => { await fs.rm(env.VIDEO_DEFAULT_ROOT, { recursive: true, force: true }); await stopDb(); });
  beforeEach(async () => {
    await resetDb();
    await fs.rm(path.join(env.VIDEO_DEFAULT_ROOT, 'temp'), { recursive: true, force: true });
  });

  it('FFmpeg алга үед файл хүлээж авахгүй, ойлгомжтой алдаа өгнө', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const admin = await login('admin');
    const saved = env.FFPROBE_PATH;
    env.FFPROBE_PATH = 'ffprobe-not-installed';
    try {
      expect((await admin.agent.get('/api/admin/video-tools')).status).toBe(503);
      const res = await uploadVideo(admin.agent, movie._id, sample, 'kino.mp4');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('FFMPEG_MISSING');
      expect(res.body.error.message).toContain('apt install');
      expect((await Movie.findById(movie._id).lean())!.videoStatus).toBe('none');
      expect(await VideoJob.countDocuments()).toBe(0);
    } finally {
      env.FFPROBE_PATH = saved;
    }
    expect((await admin.agent.get('/api/admin/video-tools')).status).toBe(200);
  });

  it('worker дээр FFmpeg алга бол эх файл хадгалагдаж, суулгасны дараа дахин байршуулахгүй боловсруулна', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const admin = await login('admin');
    const up = await uploadVideo(admin.agent, movie._id, sample, 'kino.mp4');
    expect(up.status).toBe(202);
    const job = (await VideoService.claimNext())!;
    const saved = env.FFPROBE_PATH;
    env.FFPROBE_PATH = 'ffprobe-not-installed';
    try {
      await VideoService.process(job);
    } finally {
      env.FFPROBE_PATH = saved;
    }
    const failed = (await Movie.findById(movie._id).lean())!;
    expect(failed.videoStatus).toBe('failed');
    expect(failed.videoError).toContain('apt install');
    expect(failed.videoError).not.toContain('ENOENT');
    await fs.access(job.sourcePath);
    expect((await admin.agent.get(`/api/admin/movies/${movie._id}`)).body.videoRetryable).toBe(true);

    expect((await admin.agent.post(`/api/admin/movies/${movie._id}/video/retry`)).status).toBe(202);
    expect((await Movie.findById(movie._id).lean())!.videoStatus).toBe('queued');
    await VideoService.process((await VideoService.claimNext())!);
    expect((await Movie.findById(movie._id).lean())!.videoStatus).toBe('ready');
    expect((await admin.agent.get(`/api/admin/movies/${movie._id}`)).body.videoRetryable).toBe(false);
    expect((await admin.agent.post(`/api/admin/movies/${movie._id}/video/retry`)).status).toBe(409);
  });

  it('шинэ файл байршуулахад хуучин амжилтгүй файл дискэнд үлдэхгүй', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const admin = await login('admin');
    await uploadVideo(admin.agent, movie._id, sample, 'kino.mp4');
    const job = (await VideoService.claimNext())!;
    const saved = env.FFPROBE_PATH;
    env.FFPROBE_PATH = 'ffprobe-not-installed';
    await VideoService.process(job).finally(() => { env.FFPROBE_PATH = saved; });
    await uploadVideo(admin.agent, movie._id, sample, 'kino2.mp4');
    await expect(fs.access(job.sourcePath)).rejects.toThrow();
  });

  it('эвдэрсэн файл нь дахин оролдох боломжгүй, эх файл устана', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const admin = await login('admin');
    await uploadVideo(admin.agent, movie._id, Buffer.from('not a video'), 'bad.mp4');
    const job = (await VideoService.claimNext())!;
    await VideoService.process(job);
    await expect(fs.access(job.sourcePath)).rejects.toThrow();
    expect((await admin.agent.get(`/api/admin/movies/${movie._id}`)).body.videoRetryable).toBe(false);
    expect((await Movie.findById(movie._id).lean())!.videoError).toContain('боловсруулж чадсангүй');
  });

  it('admin байршуулж, worker боловсруулж, эрхтэй хэрэглэгч манифест ба сегмент авна', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const admin = await login('admin');
    const up = await uploadVideo(admin.agent, movie._id, sample, 'kino.mp4');
    expect(up.status).toBe(202);

    const job = (await VideoService.claimNext())!;
    // Удаан боловсруулж буй ажил явц бичих бүрт түгжээгээ сунгаж, давхар эхлэхгүй.
    const oldLock = new Date(Date.now() - 86_400_000);
    await VideoJob.updateOne({ _id: job._id }, { $set: { lockedAt: oldLock } });
    await VideoService.process(job);
    expect((await VideoJob.findById(job._id).lean())!.lockedAt!.getTime()).toBeGreaterThan(oldLock.getTime());

    const after = await Movie.findById(movie._id).select('+videoSource +hlsPath').lean();
    expect(after!.videoStatus).toBe('ready');
    expect(after!.videoProgress).toBeUndefined();
    expect(Math.round(after!.duration!)).toBe(4);
    expect(after!.hlsPath).toBe(`hls/${movie._id}`);
    expect((await VideoJob.findById(up.body.jobId).lean())!.status).toBe('ready');
    // Эх файл нийтэд гарахгүй originals/-д, түр хавтас цэвэрлэгдсэн
    expect(after!.videoSource).toContain('originals');
    expect((await fs.readdir(path.join(env.VIDEO_DEFAULT_ROOT, 'temp'))).length).toBe(0);

    const viewer = await login();
    expect((await viewer.agent.post(`/api/stream/${movie._id}/token`)).status).toBe(402);
    await Subscription.create({ seq: 1, userId: viewer.user._id, planCode: 'MONTHLY', amount: 1, currency: 'MNT', status: 'active', startedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
    const grant = await viewer.agent.post(`/api/stream/${movie._id}/token`);
    const base = new URL(grant.body.manifestUrl).pathname.replace('master.m3u8', '');
    const master = await api().get(`${base}master.m3u8`);
    expect(master.status).toBe(200);
    expect(master.text).toContain('480p/index.m3u8');
    expect(master.text).not.toContain('720p');
    const playlist = await api().get(`${base}480p/index.m3u8`);
    expect(playlist.text).toContain('seg_00000.ts');
    const seg = await api().get(`${base}480p/seg_00000.ts`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(seg.status).toBe(200);
    expect((seg.body as Buffer)[0]).toBe(0x47); // MPEG-TS sync byte
  });
});
