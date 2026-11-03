import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { Types } from 'mongoose';
import { env } from '../src/config/env';
import { Movie, VideoJob, VideoUpload } from '../src/models';
import { VideoUploadService } from '../src/services/videoUpload.service';
import { api, login, makeMovie, resetDb, startDb, stopDb } from './helpers';

const MB = 1024 * 1024;
const CHUNK = 3 * MB;
const FILE = { fileName: 'kino.mp4', size: CHUNK * 2 + 100, lastModified: 1 };
const bytes = (length: number, fill: number) => Buffer.alloc(length, fill);

describe('Видео хэсэгчлэн байршуулах', () => {
  beforeAll(startDb);
  afterAll(async () => { await fs.rm(env.VIDEO_DEFAULT_ROOT, { recursive: true, force: true }); await stopDb(); });
  beforeEach(resetDb);

  async function begin(file = FILE) {
    const movie = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    const base = `/api/admin/movies/${movie._id}/upload`;
    const start = await agent.post(`${base}/start`).send(file);
    expect(start.status).toBe(200);
    const url = `${base}/${start.body.uploadId}`;
    const send = (index: number, data: Buffer) => agent.put(`${url}/chunks/${index}`).set('Content-Type', 'application/octet-stream').send(data);
    return { movie, agent, base, url, start: start.body, send, complete: () => agent.post(`${url}/complete`).send({}) };
  }

  it('хэмжээний хязгааргүй: 5 GB кино эхлэж чадна', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    const free = await fs.statfs(env.VIDEO_DEFAULT_ROOT).catch(() => null);
    const res = await agent.post(`/api/admin/movies/${movie._id}/upload/start`).send({ ...FILE, size: 5 * 1024 * MB });
    // Энэ машинд 5 GB сул зай байхгүй бол дискний шалгалт л татгалзах ёстой, хэмжээний хязгаар биш.
    if (res.status === 200) expect(res.body.chunkSize).toBe(CHUNK);
    else expect([res.body.error.code, free]).toContain('DISK_FULL');
  });

  it('дарааллаас үл хамааран ирсэн хэсгүүд яг эх файл болж нийлнэ', async () => {
    const { movie, send, complete } = await begin();
    expect((await send(2, bytes(100, 3))).status).toBe(200);
    expect((await send(0, bytes(CHUNK, 1))).status).toBe(200);
    expect((await send(1, bytes(CHUNK, 2))).status).toBe(200);
    const done = await complete();
    expect(done.status).toBe(202);
    const job = (await VideoJob.findById(done.body.jobId).lean())!;
    const merged = await fs.readFile(job.sourcePath);
    expect(merged.length).toBe(FILE.size);
    expect(merged[0]).toBe(1);
    expect(merged[CHUNK]).toBe(2);
    expect(merged[CHUNK * 2]).toBe(3);
    expect((await Movie.findById(movie._id).lean())!.videoStatus).toBe('queued');
  });

  it('тасарсны дараа ижил файлыг сонговол үлдсэнээс нь үргэлжилнэ', async () => {
    const { base, agent, start, send } = await begin();
    await send(1, bytes(CHUNK, 2));
    const again = await agent.post(`${base}/start`).send(FILE);
    expect(again.body.uploadId).toBe(start.uploadId);
    expect(again.body.received).toEqual([1]);
  });

  it('байршуулалтын хугацаанд завсарласан хугацаа орохгүй, шинэ файл хуучин хугацааг цэвэрлэнэ', async () => {
    const { movie, base, agent, start, send, complete } = await begin();
    await Movie.updateOne({ _id: movie._id }, { $set: { videoProcessSeconds: 999 } });
    await send(0, bytes(CHUNK, 1));
    // 10 минут ажиллаад 5 цаг завсарласан.
    const now = Date.now();
    await VideoUpload.collection.updateOne({ _id: new Types.ObjectId(start.uploadId) }, { $set: { startedAt: new Date(now - 5 * 3600_000 - 600_000), updatedAt: new Date(now - 5 * 3600_000) } });
    await agent.post(`${base}/start`).send(FILE);
    await send(1, bytes(CHUNK, 2));
    await send(2, bytes(100, 3));
    expect((await complete()).status).toBe(202);
    const after = (await Movie.findById(movie._id).lean())!;
    expect(after.videoUploadSeconds).toBeGreaterThanOrEqual(600);
    expect(after.videoUploadSeconds).toBeLessThan(660);
    expect(after.videoProcessSeconds).toBeUndefined();
  });

  it('ижил хэсгийг давтан илгээхэд эвдрэхгүй', async () => {
    const { send, complete } = await begin({ ...FILE, size: 100 });
    await send(0, bytes(100, 1));
    await send(0, bytes(100, 2));
    const done = await complete();
    expect(done.status).toBe(202);
    expect((await fs.readFile((await VideoJob.findById(done.body.jobId).lean())!.sourcePath))[0]).toBe(2);
  });

  it('хэсэг дутуу бол дуусгахгүй, давтан дуусгахад дахин дараалалд орохгүй', async () => {
    const { send, complete } = await begin();
    await send(0, bytes(CHUNK, 1));
    const early = await complete();
    expect(early.status).toBe(409);
    expect(early.body.error.message).toContain('2 хэсэг дутуу');
    await send(1, bytes(CHUNK, 1));
    await send(2, bytes(100, 1));
    const first = await complete();
    const second = await complete();
    expect(second.status).toBe(202);
    expect(second.body.jobId).toBe(first.body.jobId);
    expect(await VideoJob.countDocuments()).toBe(1);
  });

  it('буруу хэмжээ, дугаар, файлын төрлийг татгалзана', async () => {
    const { send, base, agent } = await begin();
    expect((await send(0, bytes(10, 1))).status).toBe(400);
    expect((await send(2, bytes(CHUNK, 1))).status).toBe(400);
    expect((await send(3, bytes(100, 1))).status).toBe(400);
    expect((await send(0, bytes(CHUNK + 1, 1))).status).toBe(413);
    expect((await agent.post(`${base}/start`).send({ ...FILE, fileName: 'virus.exe' })).status).toBe(400);
  });

  it('диск хүрэлцэхгүй бол дамжуулахаас өмнө ойлгомжтой татгалзана', async () => {
    const movie = await makeMovie({ videoStatus: 'none' });
    const { agent } = await login('admin');
    const res = await agent.post(`/api/admin/movies/${movie._id}/upload/start`).send({ ...FILE, size: 2 ** 52 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DISK_FULL');
    expect(res.body.error.message).toContain('GB');
    expect(await VideoUpload.countDocuments()).toBe(0);
  });

  it('файл солих явцад одоогийн кино үзэгдсээр байна', async () => {
    const movie = await makeMovie({ videoStatus: 'ready' });
    const { agent } = await login('admin');
    await agent.post(`/api/admin/movies/${movie._id}/upload/start`).send(FILE);
    expect((await Movie.findById(movie._id).lean())!.videoStatus).toBe('ready');
  });

  it('жагсаалт байршуулалтын явцыг харуулж, дуусмагц алга болно', async () => {
    const { movie, agent, start, send, complete } = await begin();
    const listed = async () => (await agent.get('/api/admin/movies')).body.items.find((m: { id: string }) => m.id === String(movie._id));
    expect((await listed()).videoUpload).toEqual({ fileName: 'kino.mp4', percent: 0, stalled: false });
    await send(0, bytes(CHUNK, 1));
    expect((await listed()).videoUpload).toEqual({ fileName: 'kino.mp4', percent: 33, stalled: false });
    expect((await agent.get(`/api/admin/movies/${movie._id}`)).body.videoUpload.percent).toBe(33);

    await VideoUpload.collection.updateOne({ _id: new Types.ObjectId(start.uploadId) }, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } });
    expect((await listed()).videoUpload).toEqual({ fileName: 'kino.mp4', percent: 33, stalled: true });

    await send(1, bytes(CHUNK, 2));
    expect((await listed()).videoUpload).toEqual({ fileName: 'kino.mp4', percent: 66, stalled: false });
    await send(2, bytes(100, 3));
    expect((await complete()).status).toBe(202);
    const after = await listed();
    expect(after.videoUpload).toBeUndefined();
    expect(after.videoStatus).toBe('queued');
  });

  it('файлтай кинонд үлдэгдэл байршуулалт харагдахгүй', async () => {
    const movie = await makeMovie({ videoStatus: 'ready', hlsPath: 'hls/x' });
    const { agent } = await login('admin');
    await agent.post(`/api/admin/movies/${movie._id}/upload/start`).send(FILE);
    expect((await agent.get('/api/admin/movies')).body.items[0].videoUpload).toBeUndefined();
  });

  it('эрхгүй бол хэсэг хүлээж авахгүй', async () => {
    const { url } = await begin();
    expect((await api().put(`${url}/chunks/0`).set('Content-Type', 'application/octet-stream').send(bytes(100, 1))).status).toBe(401);
    const viewer = await login();
    expect((await viewer.agent.put(`${url}/chunks/0`).set('Content-Type', 'application/octet-stream').send(bytes(100, 1))).status).toBe(403);
  });

  it('өөр файл сонгох, кино устгах, удаан орхиход түр файл үлдэхгүй', async () => {
    const replaced = await begin();
    const first = (await VideoUpload.findById(replaced.start.uploadId).lean())!;
    await replaced.agent.post(`${replaced.base}/start`).send({ ...FILE, fileName: 'other.mp4' });
    await expect(fs.access(first.tempPath)).rejects.toThrow();
    expect(await VideoUpload.countDocuments({ movieId: replaced.movie._id })).toBe(1);

    const current = (await VideoUpload.findOne({ movieId: replaced.movie._id }).lean())!;
    expect((await replaced.agent.delete(`/api/admin/movies/${replaced.movie._id}`)).status).toBe(200);
    await expect(fs.access(current.tempPath)).rejects.toThrow();
    expect(await VideoUpload.countDocuments()).toBe(0);

    const abandoned = await begin();
    const doc = (await VideoUpload.findById(abandoned.start.uploadId).lean())!;
    await VideoUploadService.cleanup(Date.now() - 86_400_000);
    await fs.access(doc.tempPath);
    await VideoUploadService.cleanup(Date.now() + 8 * 86_400_000);
    await expect(fs.access(doc.tempPath)).rejects.toThrow();
    expect(await VideoUpload.countDocuments()).toBe(0);
  });
});
