import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { env } from '../config/env';
import { Movie, VideoJob } from '../models';
import { VideoSettings } from './settings.schemas';
import { VideoConfigurationService } from './videoConfiguration.service';

const run = promisify(execFile);
const MAX_ATTEMPTS = 3;
const STALE_LOCK_MS = 6 * 60 * 60 * 1000;

// Өндөр -> зорилтот видео битрейт (kbps). Master playlist-ийн BANDWIDTH-д ашиглана.
const BITRATES: Record<number, number> = { 2160: 14000, 1440: 8000, 1080: 5000, 720: 2800, 480: 1400, 360: 800 };

export interface Probe { width: number; height: number; duration: number; hasAudio: boolean }

export async function probe(file: string, ffprobe = env.FFPROBE_PATH): Promise<Probe> {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { maxBuffer: 10 * 1024 * 1024 });
  const info = JSON.parse(stdout);
  const video = info.streams?.find((s: any) => s.codec_type === 'video');
  if (!video) throw new Error('Файлд видео урсгал олдсонгүй.');
  return {
    width: Number(video.width), height: Number(video.height), duration: Number(info.format?.duration ?? 0),
    hasAudio: !!info.streams.some((s: any) => s.codec_type === 'audio'),
  };
}

// Эх файлаас өндөр чанар үүсгэхгүй. Бүгд өндөр бол эх файлын өндрийг ашиглана.
export function planLadder(sourceHeight: number, configured: number[]) {
  const ladder = [...new Set(configured)].filter((h) => h <= sourceHeight).sort((a, b) => b - a);
  return ladder.length ? ladder : [sourceHeight - (sourceHeight % 2)];
}

export async function transcode(source: string, outDir: string, cfg: VideoSettings['ffmpeg'], resolutions: number[], ffmpeg = env.FFMPEG_PATH, ffprobe = env.FFPROBE_PATH) {
  const info = await probe(source, ffprobe);
  const ladder = planLadder(info.height, resolutions);
  const variants: string[] = [];
  for (const height of ladder) {
    const dir = path.join(outDir, `${height}p`);
    await fs.mkdir(dir, { recursive: true });
    const kbps = BITRATES[height] ?? Math.round(height * 5);
    const width = Math.round((info.width * height) / info.height / 2) * 2;
    await run(ffmpeg, [
      '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=${width}:${height}`, '-c:v', 'libx264', '-preset', cfg.preset, '-crf', String(cfg.crf),
      '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-threads', String(cfg.threads),
      '-force_key_frames', `expr:gte(t,n_forced*${cfg.segmentSeconds})`,
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-f', 'hls', '-hls_time', String(cfg.segmentSeconds), '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(dir, 'seg_%05d.ts'), path.join(dir, 'index.m3u8'),
    ], { maxBuffer: 10 * 1024 * 1024 });
    variants.push(`#EXT-X-STREAM-INF:BANDWIDTH=${(kbps + 128) * 1000},RESOLUTION=${width}x${height}\n${height}p/index.m3u8`);
  }
  await fs.writeFile(path.join(outDir, 'master.m3u8'), `#EXTM3U\n#EXT-X-VERSION:3\n${variants.join('\n')}\n`);
  return { info, ladder };
}

// Эцсийн хавтас руу зөөхөөс өмнө манифест бүр сегменттэй, файлууд нь бодитоор байгааг шалгана.
export async function verifyHls(dir: string) {
  const master = await fs.readFile(path.join(dir, 'master.m3u8'), 'utf8');
  const playlists = master.split('\n').filter((l) => l.endsWith('.m3u8'));
  if (!playlists.length) throw new Error('Master манифестэд чанар алга байна.');
  for (const rel of playlists) {
    const text = await fs.readFile(path.join(dir, rel), 'utf8');
    const segments = text.split('\n').filter((l) => l.endsWith('.ts'));
    if (!segments.length || !text.includes('#EXT-X-ENDLIST')) throw new Error(`${rel} манифест бүрэн бус байна.`);
    await Promise.all(segments.map((s) => fs.access(path.join(dir, path.dirname(rel), s))));
  }
}

export const VideoService = {
  async enqueue(movieId: string, sourcePath: string) {
    await VideoJob.updateMany({ movieId, status: 'queued' }, { $set: { status: 'failed', error: 'Шинэ файлаар солигдсон' } });
    const job = await VideoJob.create({ movieId, sourcePath });
    await Movie.updateOne({ _id: movieId }, { $set: { videoStatus: 'queued' }, $unset: { videoError: 1 } });
    return job;
  },

  async claimNext() {
    return VideoJob.findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'processing', lockedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true },
    );
  },

  // Worker унтарсан тохиолдолд түгжигдэж үлдсэн ажлыг дараалалд буцаана.
  async requeueStale(now = Date.now()) {
    await VideoJob.updateMany({ status: 'processing', lockedAt: { $lt: new Date(now - STALE_LOCK_MS) }, attempts: { $lt: MAX_ATTEMPTS } }, { $set: { status: 'queued' } });
  },

  async process(job: { _id: unknown; movieId: unknown; sourcePath: string }) {
    const settings = await VideoConfigurationService.get({ fresh: true });
    const dirs = VideoConfigurationService.dirs(settings.storageRoot);
    const movieId = String(job.movieId);
    const work = path.join(dirs.temp, `job-${job._id}`);
    await Movie.updateOne({ _id: movieId }, { $set: { videoStatus: 'processing' } });
    try {
      await fs.rm(work, { recursive: true, force: true });
      await fs.mkdir(work, { recursive: true });
      const { info } = await transcode(job.sourcePath, work, settings.ffmpeg, settings.hlsResolutions);
      await verifyHls(work);
      await fs.mkdir(dirs.hls, { recursive: true });
      await fs.mkdir(dirs.originals, { recursive: true });
      const finalDir = path.join(dirs.hls, movieId);
      await fs.rm(finalDir, { recursive: true, force: true });
      await fs.rename(work, finalDir);
      const original = path.join(dirs.originals, `${movieId}${path.extname(job.sourcePath)}`);
      await fs.rename(job.sourcePath, original);
      await Movie.updateOne({ _id: movieId }, {
        $set: { videoStatus: 'ready', hlsPath: `hls/${movieId}`, videoSource: original, duration: Math.round(info.duration) },
        $unset: { videoError: 1 },
      });
      await VideoJob.updateOne({ _id: job._id }, { $set: { status: 'ready', sourcePath: original, finishedAt: new Date() }, $unset: { error: 1 } });
    } catch (err) {
      const message = (err as Error).message.slice(0, 1000);
      console.error(`[video] боловсруулалт амжилтгүй ${movieId}:`, message);
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(job.sourcePath, { force: true }).catch(() => undefined);
      await Movie.updateOne({ _id: movieId }, { $set: { videoStatus: 'failed', videoError: message } });
      await VideoJob.updateOne({ _id: job._id }, { $set: { status: 'failed', error: message, finishedAt: new Date() } });
    }
  },
};
