import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Movie, VideoUpload } from '../models';
import { AppError, badRequest, conflict, notFound, unavailable } from '../utils/errors';
import { VideoService } from './video.service';
import { VideoConfigurationService } from './videoConfiguration.service';

// Нэг хүсэлтийн хэмжээ: Vercel-ийн прокси, түүний 120 секундын хязгаарт багтахаар бага байна.
export const CHUNK_BYTES = 3 * 1024 * 1024;
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v']);
const ABANDONED_MS = 7 * 24 * 60 * 60 * 1000;
const GB = 1024 ** 3;
const DISK_FULL = 'Серверийн диск дүүрсэн байна. Зай чөлөөлөөд дахин оролдоно уу.';

interface StartInput { fileName: string; size: number; lastModified: number }

const chunkCount = (size: number) => Math.ceil(size / CHUNK_BYTES);

async function discard(filter: Record<string, unknown>) {
  const uploads = await VideoUpload.find({ ...filter, status: 'uploading' }).lean();
  await Promise.all(uploads.map((u) => fs.rm(u.tempPath, { force: true })));
  await VideoUpload.deleteMany({ _id: { $in: uploads.map((u) => u._id) } });
}

export const VideoUploadService = {
  // Ижил файлыг дахин сонговол тасарсан газраасаа үргэлжилнэ.
  async start(movieId: string, input: StartInput) {
    if (!(await Movie.exists({ _id: movieId }))) throw notFound('Кино олдсонгүй.');
    const ext = path.extname(input.fileName).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) throw badRequest('Зөвхөн видео файл (mp4, mkv, mov, webm, avi) байршуулна.');
    await VideoService.checkTools();

    const fileKey = `${input.fileName}|${input.size}|${input.lastModified}`;
    const existing = await VideoUpload.findOne({ movieId, fileKey, status: 'uploading' }).lean();
    if (existing && await fs.access(existing.tempPath).then(() => true, () => false)) {
      return { uploadId: String(existing._id), chunkSize: existing.chunkSize, received: existing.received };
    }
    await discard({ movieId });

    const { storageRoot } = await VideoConfigurationService.get({ fresh: true });
    const { temp } = VideoConfigurationService.dirs(storageRoot);
    await fs.mkdir(temp, { recursive: true });
    // Хэдэн цаг дамжуулсны дараа биш, эхэндээ татгалзана.
    const disk = await fs.statfs(temp);
    const free = disk.bavail * disk.bsize;
    if (free < input.size) throw unavailable('DISK_FULL', `Серверийн дискэнд зай хүрэлцэхгүй: ${(input.size / GB).toFixed(1)} GB хэрэгтэй, ${(free / GB).toFixed(1)} GB сул байна.`);

    const tempPath = path.join(temp, `upload-${crypto.randomUUID()}${ext}`);
    await (await fs.open(tempPath, 'w')).close();
    const upload = await VideoUpload.create({ movieId, fileKey, fileName: input.fileName, size: input.size, chunkSize: CHUNK_BYTES, tempPath, received: [] });
    return { uploadId: String(upload._id), chunkSize: upload.chunkSize, received: [] as number[] };
  },

  // Хэсэг бүр файлын өөрийн байрлалд бичигдэх тул зэрэг, дарааллаас үл хамааран, давтаж илгээж болно.
  async writeChunk(movieId: string, uploadId: string, index: number, data: Buffer) {
    const upload = await VideoUpload.findOne({ _id: uploadId, movieId, status: 'uploading' }).lean();
    if (!upload) throw notFound('Байршуулалт олдсонгүй. Файлаа дахин сонгоно уу.');
    const count = chunkCount(upload.size);
    if (index >= count) throw badRequest('Файлын хэсгийн дугаар буруу байна.');
    const expected = index === count - 1 ? upload.size - index * upload.chunkSize : upload.chunkSize;
    if (!Buffer.isBuffer(data) || data.length !== expected) throw badRequest('Файлын хэсгийн хэмжээ буруу байна.');

    const file = await fs.open(upload.tempPath, 'r+');
    try {
      const { bytesWritten } = await file.write(data, 0, data.length, index * upload.chunkSize);
      if (bytesWritten !== data.length) throw unavailable('DISK_FULL', DISK_FULL);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOSPC') throw unavailable('DISK_FULL', DISK_FULL);
      throw err;
    } finally {
      await file.close();
    }
    await VideoUpload.updateOne({ _id: uploadId }, { $addToSet: { received: index } });
  },

  // Сүлжээ тасарч хариу алдагдсан бол давтан дуудаж болно: дахин дараалалд орохгүй.
  async complete(movieId: string, uploadId: string) {
    const upload = await VideoUpload.findOne({ _id: uploadId, movieId }).lean();
    if (!upload) throw notFound('Байршуулалт олдсонгүй. Файлаа дахин сонгоно уу.');
    if (upload.status === 'completed') return { jobId: String(upload.jobId), size: upload.size };

    const missing = chunkCount(upload.size) - upload.received.length;
    if (missing > 0) throw conflict(`Файлын ${missing} хэсэг дутуу байна.`);
    const { size } = await fs.stat(upload.tempPath);
    if (size !== upload.size) throw new AppError(409, 'CONFLICT', 'Файлын хэмжээ таарахгүй байна. Дахин байршуулна уу.');

    const claimed = await VideoUpload.findOneAndUpdate({ _id: uploadId, status: 'uploading' }, { $set: { status: 'completed' } });
    if (!claimed) {
      const done = await VideoUpload.findById(uploadId).lean();
      return { jobId: String(done?.jobId), size: upload.size };
    }
    try {
      const job = await VideoService.enqueue(movieId, upload.tempPath);
      await VideoUpload.updateOne({ _id: uploadId }, { $set: { jobId: job._id } });
      return { jobId: String(job._id), size: upload.size };
    } catch (err) {
      await VideoUpload.updateOne({ _id: uploadId }, { $set: { status: 'uploading' } });
      throw err;
    }
  },

  discardForMovie: (movieId: string) => discard({ movieId }),

  // Орхигдсон байршуулалт дискийг дүүргэхгүй. Дууссан бичлэгийн файлыг worker эзэмшдэг.
  async cleanup(now = Date.now()) {
    const before = new Date(now - ABANDONED_MS);
    await discard({ updatedAt: { $lt: before } });
    await VideoUpload.deleteMany({ status: 'completed', updatedAt: { $lt: before } });
  },
};
