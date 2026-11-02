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

export function setAuthCookies(res: Response, access: string, refresh: string, refreshExpires: Date, persistent = true) {
  res.cookie('mf_access', access, { ...cookieBase(), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie('mf_refresh', refresh, { ...cookieBase(), path: REFRESH_PATH, ...(persistent ? { expires: refreshExpires } : {}) });
}
export function clearAuthCookies(res: Response) {
  res.clearCookie('mf_access', { ...cookieBase(), path: '/' });
  res.clearCookie('mf_refresh', { ...cookieBase(), path: REFRESH_PATH });
}

// Хэрэглэгчийг хүсэлт бүрт баазаас уншина: блоклолт, эрхийн өөрчлөлт тэр дороо хүчинтэй.
async function loadUser(req: Request) {
  const token = req.cookies?.mf_access;
  if (!token) return null;
  let claims: { sub: string; fam: string };
  try {
    claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: 'access' }) as unknown as typeof claims;
  } catch {
    return null;
  }
  const user = await User.findById(claims.sub);
  if (!user || user.status !== 'active') return null;
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
  if (!(await loadUser(req))) throw unauthorized();
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') throw forbidden();
  const { allowedAdminIps } = await SettingsService.get('security');
  if (allowedAdminIps.length && !allowedAdminIps.includes(clientIp(req))) throw forbidden('Энэ IP хаягаас админ хэсэгт нэвтрэх эрхгүй.');
  next();
}

export function requireSuperadmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'superadmin') throw forbidden('Энэ үйлдлийг зөвхөн Superadmin хийнэ.');
  next();
}
