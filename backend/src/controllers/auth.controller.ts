import type { Request, Response } from 'express';
import { clearAuthCookies, setAuthCookies } from '../middleware/auth';
import { AuthService } from '../services/auth.service';
import { unauthorized } from '../utils/errors';
import { clientIp, parse } from '../utils/http';
import { normalizePhone } from '../utils/phone';
import { adminLoginSchema, changePasswordSchema, loginSchema, profileSchema, registerSchema } from '../validators';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

async function startSession(req: Request, res: Response, user: { _id: any; role: any }, persistent = true) {
  const s = await AuthService.issueSession(user._id, meta(req), { persistent });
  setAuthCookies(res, AuthService.signAccess(user, s.familyId), s.refreshToken, s.expiresAt, s.persistent);
}

export async function register(req: Request, res: Response) {
  const { phone, password, name } = parse(registerSchema, req.body);
  const user = await AuthService.register(normalizePhone(phone), password, name);
  await startSession(req, res, user);
  res.status(201).json({ user: AuthService.view(user) });
}

export async function login(req: Request, res: Response) {
  const { phone, password } = parse(loginSchema, req.body);
  const user = await AuthService.login(normalizePhone(phone), password);
  await startSession(req, res, user);
  res.json({ user: AuthService.view(user) });
}

export async function adminLogin(req: Request, res: Response) {
  const { email, password, remember } = parse(adminLoginSchema, req.body);
  const user = await AuthService.loginAdmin(email, password);
  await startSession(req, res, user, remember);
  res.json({ user: AuthService.view(user) });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.mf_refresh;
  if (!token) throw unauthorized();
  try {
    const r = await AuthService.rotate(token, meta(req));
    setAuthCookies(res, AuthService.signAccess(r.user, r.familyId), r.refreshToken, r.expiresAt, r.persistent);
    res.json({ user: AuthService.view(r.user) });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  if (req.sessionFamily) await AuthService.revokeFamily(req.sessionFamily);
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  res.json({ user: AuthService.view(req.user!) });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  await AuthService.changePassword(req.user!._id, currentPassword, newPassword);
  // Бусад төхөөрөмж гарсан, энэ төхөөрөмж шинэ сешнтэй үргэлжилнэ.
  await startSession(req, res, req.user!);
  res.json({ ok: true });
}

export async function updateProfile(req: Request, res: Response) {
  const { name } = parse(profileSchema, req.body);
  req.user!.name = name;
  await req.user!.save();
  res.json({ user: AuthService.view(req.user!) });
}
