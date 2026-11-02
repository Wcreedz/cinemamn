import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from './errors';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Оруулсан мэдээлэл буруу байна.', details);
  }
  return r.data;
}

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'ID буруу байна');

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().regex(/^-?[a-zA-Z]+$/).optional(),
});

export function sortFrom(sort: string | undefined, allowed: string[], fallback: string): Record<string, 1 | -1> {
  const key = sort && allowed.includes(sort.replace(/^-/, '')) ? sort : fallback;
  return key.startsWith('-') ? { [key.slice(1)]: -1 } : { [key]: 1 };
}

export function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export const clientIp = (req: Request) => req.ip ?? '';
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
