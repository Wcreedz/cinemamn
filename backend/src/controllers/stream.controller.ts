import type { Request, Response } from 'express';
import path from 'path';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { Movie, WatchHistory } from '../models';
import { StreamService } from '../services/stream.service';
import { VideoConfigurationService } from '../services/videoConfiguration.service';
import { safeEqual } from '../utils/crypto';
import { AppError, forbidden, notFound } from '../utils/errors';
import { clientIp, objectId, parse } from '../utils/http';
import { watchProgressSchema } from '../validators';
import { movieSummary } from './movie.controller';

export async function issueToken(req: Request, res: Response) {
  const movieId = parse(objectId, req.params.movieId);
  const g = await StreamService.grant(req.user!._id, movieId, clientIp(req));
  res.json({ manifestUrl: g.manifestUrl, expiresAt: g.expiresAt, resumeSeconds: g.resumeSeconds });
}

// Nginx auth_request: сегмент бүрийн өмнө дуудагдана. Хариу нь 2xx эсвэл 401/403.
export async function internalVerify(req: Request, res: Response) {
  const given = String(req.headers['x-internal-secret'] ?? '');
  if (!safeEqual(given, env.INTERNAL_AUTH_SECRET)) throw forbidden();
  try {
    const { token, movieId, file } = StreamService.parseOriginalUri(String(req.headers['x-original-uri'] ?? ''));
    await StreamService.authorize(token, movieId, file);
    res.status(204).end();
  } catch (err) {
    if (err instanceof AppError) return res.status(403).end();
    throw err;
  }
}

// Nginx-гүй хөгжүүлэлтийн орчин, тестэд зориулсан HLS хүргэлт (SERVE_HLS_FROM_API=true).
export async function deliver(req: Request, res: Response) {
  const parts = req.params.file as unknown as string[];
  const file = parts.join('/');
  await StreamService.authorize(String(req.params.token), String(req.params.movieId), file);
  const { storageRoot } = await VideoConfigurationService.get();
  const root = path.join(VideoConfigurationService.dirs(storageRoot).hls, String(req.params.movieId));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Access-Control-Allow-Origin', env.corsOrigins[0] ?? '*');
  res.sendFile(file, { root, dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
}

export async function watchHistory(req: Request, res: Response) {
  const rows = await WatchHistory.find({ userId: req.user!._id }).sort({ lastWatchedAt: -1 }).limit(60)
    .populate({ path: 'movieId', select: '+hlsPath', populate: { path: 'genres' } }).lean();
  res.json({
    items: rows.filter((r: any) => r.movieId?.isPublished).map((r: any) => ({
      movie: movieSummary(r.movieId), progressSeconds: r.progressSeconds, durationSeconds: r.durationSeconds, completed: r.completed, lastWatchedAt: r.lastWatchedAt,
    })),
  });
}

export async function saveProgress(req: Request, res: Response) {
  const movieId = new Types.ObjectId(parse(objectId, req.params.movieId));
  const b = parse(watchProgressSchema, req.body);
  if (!(await Movie.exists({ _id: movieId, isPublished: true }))) throw notFound('Кино олдсонгүй.');
  const completed = b.completed ?? (b.durationSeconds > 0 && b.progressSeconds / b.durationSeconds > 0.95);
  await WatchHistory.updateOne(
    { userId: req.user!._id, movieId },
    { $set: { progressSeconds: b.progressSeconds, durationSeconds: b.durationSeconds, completed, lastWatchedAt: new Date() } },
    { upsert: true },
  );
  res.json({ ok: true, completed });
}
