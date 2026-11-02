import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { env } from '../src/config/env';
import { Movie, Subscription, VideoJob } from '../src/models';
import { VideoService } from '../src/services/video.service';
import { api, login, makeMovie, resetDb, startDb, stopDb } from './helpers';

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
  beforeEach(resetDb);

  it('admin байршуулж, worker боловсруулж, эрхтэй хэрэглэгч манифест ба сегмент авна', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const admin = await login('admin');
    const up = await admin.agent.post(`/api/admin/movies/${movie._id}/upload`).attach('video', sample, { filename: 'kino.mp4', contentType: 'video/mp4' });
    expect(up.status).toBe(202);

    await VideoService.process((await VideoService.claimNext())!);

    const after = await Movie.findById(movie._id).select('+videoSource +hlsPath').lean();
    expect(after!.videoStatus).toBe('ready');
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
