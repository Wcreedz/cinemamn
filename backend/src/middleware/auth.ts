import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models';
import { SettingsService } from '../services/settings.service';
import { ACCESS_TTL_SECONDS } from '../services/auth.service';
import { forbidden, unauthorized } from '../utils/errors';
import { clientIp } from '../utils/http';

const cookieBase = () => ({
  httpOnly: true, secure: env.cookieSecure, sameSite: 'lax' as const,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});
const REFRESH_PATH = '/api/auth';

// Админ, хэрэглэгч тусдаа cookie-тэй: нэг хөтчийн хоёр табд зэрэг ажиллаж, нэг нь нөгөөгөө дарахгүй.
export type AuthScope = 'customer' | 'admin';
const COOKIES: Record<AuthScope, { access: string; refresh: string }> = {
  customer: { access: 'mf_access', refresh: 'mf_refresh' },
  admin: { access: 'mf_admin_access', refresh: 'mf_admin_refresh' },
};

// Таб аль сессээр ажиллахаа толгойгоор хэлнэ. Энэ нь эрх биш: тухайн cookie байхгүй бол юу ч өгөхгүй.
export const scopeOf = (req: Request): AuthScope => (req.headers['x-auth-scope'] === 'admin' ? 'admin' : 'customer');
export const refreshCookieOf = (req: Request, scope: AuthScope): string | undefined => req.cookies?.[COOKIES[scope].refresh];
export const hasSession = (req: Request, scope: AuthScope) => !!(req.cookies?.[COOKIES[scope].access] || req.cookies?.[COOKIES[scope].refresh]);
export const roleFits = (scope: AuthScope, role: string) => (scope === 'admin' ? role === 'admin' || role === 'superadmin' : role === 'user');

export function setAuthCookies(res: Response, scope: AuthScope, access: string, refresh: string, refreshExpires: Date, persistent = true) {
  res.cookie(COOKIES[scope].access, access, { ...cookieBase(), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(COOKIES[scope].refresh, refresh, { ...cookieBase(), path: REFRESH_PATH, ...(persistent ? { expires: refreshExpires } : {}) });
}
export function clearAuthCookies(res: Response, scope: AuthScope) {
  res.clearCookie(COOKIES[scope].access, { ...cookieBase(), path: '/' });
  res.clearCookie(COOKIES[scope].refresh, { ...cookieBase(), path: REFRESH_PATH });
}

// Хэрэглэгчийг хүсэлт бүрт баазаас уншина: блоклолт, эрхийн өөрчлөлт тэр дороо хүчинтэй.
async function loadUser(req: Request, scope: AuthScope = scopeOf(req)) {
  const token = req.cookies?.[COOKIES[scope].access];
  if (!token) return null;
  let claims: { sub: string; fam: string };
  try {
    claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: 'access' }) as unknown as typeof claims;
  } catch {
    return null;
  }
  const user = await User.findById(claims.sub);
  // Эрх өөрчлөгдсөн эсвэл хуучин хувилбарын cookie: нөгөө талын эрхээр ажиллуулахгүй.
  if (!user || user.status !== 'active' || !roleFits(scope, user.role)) return null;
  req.user = user;
  req.sessionFamily = claims.fam;
  return user;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!(await loadUser(req))) throw unauthorized();
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  await loadUser(req);
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  // Зөвхөн админ cookie-г уншина. Хэрэглэгчийн таб хандвал "эрхгүй".
  // Админ таб бол 401: access дууссан байж болох тул клиент refresh хийх боломжтой. Хэрэглэгчийн сесс үүнд нөлөөлөхгүй.
  if (!(await loadUser(req, 'admin'))) {
    if (scopeOf(req) !== 'admin' && await loadUser(req, 'customer')) throw forbidden();
    throw unauthorized();
  }
  const { allowedAdminIps } = await SettingsService.get('security');
  if (allowedAdminIps.length && !allowedAdminIps.includes(clientIp(req))) throw forbidden('Энэ IP хаягаас админ хэсэгт нэвтрэх эрхгүй.');
  next();
}

export function requireSuperadmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'superadmin') throw forbidden('Энэ үйлдлийг зөвхөн Superadmin хийнэ.');
  next();
}
