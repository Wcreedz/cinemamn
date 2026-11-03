import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { planLadder, probe, transcode, verifyHls } from '../src/services/video.service';

const run = promisify(execFile);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg: string = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffprobe: string = require('ffprobe-static').path;
const cfg = { preset: 'ultrafast' as const, crf: 30, segmentSeconds: 2, threads: 0 };

describe('Видео боловсруулалт (жинхэнэ FFmpeg)', () => {
  let dir: string;
  let source: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mf-video-'));
    source = path.join(dir, 'source.mp4');
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=10:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', source]);
  });
  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('эх файлаас өндөр чанар үүсгэхгүй', () => {
    expect(planLadder(720, [1080, 720, 480])).toEqual([720, 480]);
    expect(planLadder(1080, [1080, 720, 480])).toEqual([1080, 720, 480]);
    expect(planLadder(360, [1080, 720, 480])).toEqual([360]);
    expect(planLadder(241, [1080])).toEqual([240]);
  });

  it('эх файлын мэдээллийг уншина', async () => {
    const info = await probe(source, ffprobe);
    expect(info.height).toBe(720);
    expect(info.hasAudio).toBe(true);
    expect(info.duration).toBeGreaterThan(4);
  });

  it('HLS үүсгэж, 720p-ээс дээш чанар үүсгэхгүй, манифест баталгаажна', async () => {
    const out = path.join(dir, 'out');
    await fs.mkdir(out);
    const progress: number[] = [];
    const { ladder } = await transcode(source, out, cfg, [1080, 720, 480], ffmpeg, ffprobe, (f) => progress.push(f));
    expect(ladder).toEqual([720, 480]);
    // Нийт явц: бүх чанарыг хамарч, 0-1 хооронд өснө.
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.every((f) => f >= 0 && f <= 1)).toBe(true);
    expect(progress[progress.length - 1]).toBeGreaterThan(0.9);
    expect(progress.some((f) => f > 0.5)).toBe(true);
    await verifyHls(out);
    const master = await fs.readFile(path.join(out, 'master.m3u8'), 'utf8');
    expect(master).toContain('720p/index.m3u8');
    expect(master).not.toContain('1080p');
    const segs = await fs.readdir(path.join(out, '720p'));
    expect(segs.filter((f) => /^seg_\d+\.ts$/.test(f)).length).toBeGreaterThan(1);
  });

  it('бүрэн бус HLS-г verifyHls татгалзана', async () => {
    const bad = path.join(dir, 'bad');
    await fs.mkdir(path.join(bad, '720p'), { recursive: true });
    await fs.writeFile(path.join(bad, 'master.m3u8'), '#EXTM3U\n720p/index.m3u8\n');
    await fs.writeFile(path.join(bad, '720p', 'index.m3u8'), '#EXTM3U\nseg_00000.ts\n#EXT-X-ENDLIST\n');
    await expect(verifyHls(bad)).rejects.toThrow();
  });

  it('видео биш файл боловсруулахад алдаа өгнө', async () => {
    const fake = path.join(dir, 'fake.mp4');
    await fs.writeFile(fake, 'not a video');
    await expect(probe(fake, ffprobe)).rejects.toThrow();
  });
});
