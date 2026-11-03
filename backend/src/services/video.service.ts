import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { env } from '../config/env';
import { Movie, VideoJob } from '../models';
import { conflict, unavailable } from '../utils/errors';
import { VideoSettings } from './settings.schemas';
import { VideoConfigurationService } from './videoConfiguration.service';

const run = promisify(execFile);
const MAX_ATTEMPTS = 3;
const STALE_LOCK_MS = 6 * 60 * 60 * 1000;
// -progress хэдэн секунд тутам мөр бичдэг: урт киног боловсруулж байхад хязгаар хэтэрч FFmpeg зогсохгүй.
const PROGRESS_MAX_BUFFER = 100 * 1024 * 1024;
const TOOLS_MISSING = 'FFmpeg сервер дээр олдсонгүй. "apt install -y ffmpeg" суулгаад дахин оролдоно уу.';
const DISK_ERRORS = new Set(['ENOSPC', 'EACCES', 'EPERM', 'EROFS']);

// Файлын буруу биш, серверийн орчны асуудал мөн эсэх. Ийм үед эх файлыг устгахгүй.
function isEnvironmentError(err: NodeJS.ErrnoException) {
  return /^spawn/.test(err.syscall ?? '') || DISK_ERRORS.has(String(err.code));
}
function failureMessage(err: NodeJS.ErrnoException) {
  if (/^spawn/.test(err.syscall ?? '')) return TOOLS_MISSING;
  if (err.code === 'ENOSPC') return 'Серверийн диск дүүрсэн байна. Зай чөлөөлөөд дахин оролдоно уу.';
  if (DISK_ERRORS.has(String(err.code))) return 'Видео хадгалах хавтаст бичих эрх алга байна.';
  return `Видео файлыг боловсруулж чадсангүй: ${err.message}`.slice(0, 1000);
}

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

export async function transcode(source: string, outDir: string, cfg: VideoSettings['ffmpeg'], resolutions: number[], ffmpeg = env.FFMPEG_PATH, ffprobe = env.FFPROBE_PATH, onProgress?: (fraction: number) => void) {
  const info = await probe(source, ffprobe);
  const ladder = planLadder(info.height, resolutions);
  const variants: string[] = [];
  for (const [done, height] of ladder.entries()) {
    const dir = path.join(outDir, `${height}p`);
    await fs.mkdir(dir, { recursive: true });
    const kbps = BITRATES[height] ?? Math.round(height * 5);
    const width = Math.round((info.width * height) / info.height / 2) * 2;
    const encoding = run(ffmpeg, [
      '-y', '-nostats', '-progress', 'pipe:1', '-i', source, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=${width}:${height}`, '-c:v', 'libx264', '-preset', cfg.preset, '-crf', String(cfg.crf),
      '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-threads', String(cfg.threads),
      '-force_key_frames', `expr:gte(t,n_forced*${cfg.segmentSeconds})`,
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-f', 'hls', '-hls_time', String(cfg.segmentSeconds), '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(dir, 'seg_%05d.ts'), path.join(dir, 'index.m3u8'),
    ], { maxBuffer: PROGRESS_MAX_BUFFER });
    // ffmpeg-ийн out_time_ms нь нэрнээс үл хамааран микросекунд байдаг.
    encoding.child.stdout?.on('data', (chunk) => {
      const last = [...String(chunk).matchAll(/out_time_ms=(\d+)/g)].pop();
      if (last && info.duration > 0) onProgress?.((done + Math.min(1, Number(last[1]) / 1e6 / info.duration)) / ladder.length);
    });
    await encoding;
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
  // Том файл хүлээж авахаас өмнө дуудна.
  async checkTools() {
    try {
      await run(env.FFMPEG_PATH, ['-version']);
      await run(env.FFPROBE_PATH, ['-version']);
    } catch {
      throw unavailable('FFMPEG_MISSING', TOOLS_MISSING);
    }
  },

  async enqueue(movieId: string, sourcePath: string) {
    // Шинэ файл ирвэл хуучин амжилтгүй оролдлогын эх файл дискэнд үлдэхгүй.
    const stale = await VideoJob.find({ movieId, status: 'failed', retryable: true }).lean();
    await Promise.all(stale.map((j) => fs.rm(j.sourcePath, { force: true })));
    await VideoJob.updateMany({ movieId, status: 'failed', retryable: true }, { $set: { retryable: false } });
    await VideoJob.updateMany({ movieId, status: 'queued' }, { $set: { status: 'failed', error: 'Шинэ файлаар солигдсон' } });
    const job = await VideoJob.create({ movieId, sourcePath });
    await Movie.updateOne({ _id: movieId }, { $set: { videoStatus: 'queued' }, $unset: { videoError: 1 } });
    return job;
  },

  // Серверийн асуудал засагдсаны дараа файлаа дахин байршуулахгүйгээр боловсруулна.
  async retry(movieId: string) {
    const job = await VideoJob.findOne({ movieId, status: 'failed', retryable: true }).sort({ createdAt: -1 });
    if (!job) throw conflict('Дахин боловсруулах файл алга байна. Видеогоо дахин байршуулна уу.');
    await fs.access(job.sourcePath).catch(() => { throw conflict('Эх файл олдсонгүй. Видеогоо дахин байршуулна уу.'); });
    await VideoService.checkTools();
    await VideoJob.updateOne({ _id: job._id }, { $set: { status: 'queued', retryable: false }, $unset: { error: 1, finishedAt: 1 } });
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
    await Movie.updateOne({ _id: movieId }, { $set: { videoStatus: 'processing', videoProgress: 0 }, $unset: { videoProcessSeconds: 1 } });
    const startedAt = Date.now();
    let reported = 0;
    // Явц бичих бүрт түгжээг сунгана: ажиллаж байгаа урт киног requeueStale давхар эхлүүлэхгүй.
    const onProgress = (fraction: number) => {
      const percent = Math.floor(fraction * 100);
      if (percent <= reported) return;
      reported = percent;
      void Promise.all([
        Movie.updateOne({ _id: movieId, videoStatus: 'processing' }, { $set: { videoProgress: percent } }),
        VideoJob.updateOne({ _id: job._id }, { $set: { lockedAt: new Date() } }),
      ]).catch((err) => console.error('[video] явц бичиж чадсангүй:', (err as Error).message));
    };
    try {
      await fs.rm(work, { recursive: true, force: true });
      await fs.mkdir(work, { recursive: true });
      const { info } = await transcode(job.sourcePath, work, settings.ffmpeg, settings.hlsResolutions, undefined, undefined, onProgress);
      await verifyHls(work);
      await fs.mkdir(dirs.hls, { recursive: true });
      await fs.mkdir(dirs.originals, { recursive: true });
      const finalDir = path.join(dirs.hls, movieId);
      await fs.rm(finalDir, { recursive: true, force: true });
      await fs.rename(work, finalDir);
      const original = path.join(dirs.originals, `${movieId}${path.extname(job.sourcePath)}`);
      await fs.rename(job.sourcePath, original);
      await Movie.updateOne({ _id: movieId }, {
        $set: { videoStatus: 'ready', hlsPath: `hls/${movieId}`, videoSource: original, duration: Math.round(info.duration), videoProcessSeconds: Math.round((Date.now() - startedAt) / 1000) },
        $unset: { videoError: 1, videoProgress: 1 },
      });
      await VideoJob.updateOne({ _id: job._id }, { $set: { status: 'ready', sourcePath: original, finishedAt: new Date() }, $unset: { error: 1 } });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      const retryable = isEnvironmentError(error);
      const message = failureMessage(error);
      console.error(`[video] боловсруулалт амжилтгүй ${movieId}:`, error.message.slice(0, 1000));
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      if (!retryable) await fs.rm(job.sourcePath, { force: true }).catch(() => undefined);
      await Movie.updateOne({ _id: movieId }, { $set: { videoStatus: 'failed', videoError: message }, $unset: { videoProgress: 1 } });
      await VideoJob.updateOne({ _id: job._id }, { $set: { status: 'failed', error: message, retryable, finishedAt: new Date() } });
    }
  },
};
