import type { Request, Response } from 'express';
import { Category, Movie } from '../models';
import { notFound } from '../utils/errors';
import { escapeRegex, paged, parse } from '../utils/http';
import { isPlayable } from '../services/stream.service';
import { movieQuery } from '../validators';
import { z } from 'zod';

const categoryView = (c: any) => ({ id: String(c._id), name: c.name, slug: c.slug, description: c.description, image: c.image, sortOrder: c.sortOrder, isActive: c.isActive });

// Өмнө нь бүтэн хаягаар хадгалсан зургуудыг одоогийн домэйнд хүчинтэй зам болгоно.
const mediaPath = (url?: string) => url?.replace(/^https?:\/\/[^/]+(\/media\/)/, '$1');

export const movieSummary = (m: any) => ({
  id: String(m._id), title: m.title, slug: m.slug, poster: mediaPath(m.poster), backdrop: mediaPath(m.backdrop), description: m.description,
  releaseYear: m.releaseYear, duration: m.duration, featured: m.featured, viewCount: m.viewCount, playable: isPlayable(m),
  genres: (m.genres ?? []).filter((g: any) => g?.name).map(categoryView),
});
export const movieDetail = (m: any) => ({
  ...movieSummary(m), originalTitle: m.originalTitle, trailerUrl: m.trailerUrl, cast: m.cast ?? [], director: m.director,
  language: m.language, country: m.country, videoStatus: m.videoStatus,
});

const SORTS = { new: { createdAt: -1 }, popular: { viewCount: -1 }, title: { title: 1 } } as const;
const published = () => Movie.find({ isPublished: true }).select('+hlsPath').populate('genres');

export async function listMovies(req: Request, res: Response) {
  const q = parse(movieQuery, req.query);
  const filter: Record<string, unknown> = { isPublished: true };
  if (q.category) {
    const cat = await Category.findOne({ slug: q.category }).lean();
    if (!cat) return res.json(paged([], 0, q.page, q.limit));
    filter.genres = cat._id;
  }
  if (q.year) filter.releaseYear = q.year;
  const [items, total] = await Promise.all([
    Movie.find(filter).select('+hlsPath').populate('genres').sort(SORTS[q.sort]).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Movie.countDocuments(filter),
  ]);
  res.json(paged(items.map(movieSummary), total, q.page, q.limit));
}

export async function featured(_req: Request, res: Response) {
  res.json({ items: (await published().where({ featured: true }).sort({ updatedAt: -1 }).limit(10).lean()).map(movieSummary) });
}
export async function newest(_req: Request, res: Response) {
  res.json({ items: (await published().sort({ createdAt: -1 }).limit(20).lean()).map(movieSummary) });
}
export async function popular(_req: Request, res: Response) {
  res.json({ items: (await published().sort({ viewCount: -1 }).limit(20).lean()).map(movieSummary) });
}
export async function bySlug(req: Request, res: Response) {
  const movie = await Movie.findOne({ slug: String(req.params.slug), isPublished: true }).select('+hlsPath').populate('genres').lean();
  if (!movie) throw notFound('Кино олдсонгүй.');
  // Файл солигдож байхад үзэгчид хуучин киногоо үзсээр байна: явцын төлөв зөвхөн админд хамаатай.
  res.json({ ...movieDetail(movie), videoStatus: isPlayable(movie) ? 'ready' : movie.videoStatus });
}
export async function categories(_req: Request, res: Response) {
  const items = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ items: items.map(categoryView) });
}
export async function search(req: Request, res: Response) {
  const { q, page, limit } = parse(z.object({ q: z.string().trim().min(1).max(100), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(24) }), req.query);
  // Text index зөвхөн бүтэн үгээр хайдаг тул үр дүнгүй бол гарчгийн хэсэгчилсэн хайлт руу шилжинэ.
  let filter: Record<string, unknown> = { isPublished: true, $text: { $search: q } };
  let total = await Movie.countDocuments(filter);
  if (!total) {
    filter = { isPublished: true, title: { $regex: escapeRegex(q), $options: 'i' } };
    total = await Movie.countDocuments(filter);
  }
  const items = await Movie.find(filter).select('+hlsPath').populate('genres').skip((page - 1) * limit).limit(limit).lean();
  res.json(paged(items.map(movieSummary), total, page, limit));
}
