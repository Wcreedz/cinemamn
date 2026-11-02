import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { SettingsService } from '../services/settings.service';
import { AppError, forbidden } from '../utils/errors';

// `$`-ээр эхэлсэн эсвэл `.` агуулсан түлхүүрийг устгаж NoSQL injection-оос сэргийлнэ.
export function stripOperators<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripOperators) as T;
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor') continue;
      clean[k] = stripOperators(v);
    }
    return clean as T;
  }
  return value;
}
export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body) req.body = stripOperators(req.body);
  next();
}

// CSRF хамгаалалт: cookie нь SameSite=Lax, нэмээд төлөв өөрчлөх хүсэлтийн Origin-г allowlist-тэй тулгана.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (SAFE.has(req.method) || !origin || env.corsOrigins.includes(origin)) return next();
  throw forbidden('Энэ эх сурвалжаас хүсэлт илгээх боломжгүй.');
}

export const apiLimiter = rateLimit({ windowMs: 60_000, limit: env.RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Хэт олон хүсэлт илгээлээ. Түр хүлээнэ үү.' } } });
export const authLimiter = rateLimit({ windowMs: 10 * 60_000, limit: env.AUTH_RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Хэт олон оролдлого хийлээ. Түр хүлээнэ үү.' } } });

// Энэ middleware /api дээр холбогдсон тул req.path-д /api угтвар байхгүй.
const MAINTENANCE_EXEMPT = [/^\/health/, /^\/settings\/public/, /^\/auth\//, /^\/admin\//, /^\/payments\/qpay\/callback/];
export async function maintenanceGate(req: Request, _res: Response, next: NextFunction) {
  if (MAINTENANCE_EXEMPT.some((r) => r.test(req.path))) return next();
  const { maintenanceMode } = await SettingsService.get('general');
  if (maintenanceMode) throw new AppError(503, 'MAINTENANCE', 'Сайт засвартай байна. Удахгүй эргэн ирнэ.');
  next();
}
