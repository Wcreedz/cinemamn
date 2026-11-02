import type { Request, Response } from 'express';
import { clearAuthCookies, setAuthCookies } from '../middleware/auth';
import { User } from '../models';
import { AuthService, hashPassword } from '../services/auth.service';
import { OtpService } from '../services/otp.service';
import { unauthorized } from '../utils/errors';
import { clientIp, parse } from '../utils/http';
import { normalizePhone } from '../utils/phone';
import { loginSchema, profileSchema, registerSchema, resetSchema, sendOtpSchema, verifyOtpSchema } from '../validators';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

async function startSession(req: Request, res: Response, user: { _id: any; role: any }) {
  const s = await AuthService.issueSession(user._id, meta(req));
  setAuthCookies(res, AuthService.signAccess(user, s.familyId), s.refreshToken, s.expiresAt);
}

export async function sendOtp(req: Request, res: Response) {
  const { phone, purpose } = parse(sendOtpSchema, req.body);
  const normalized = normalizePhone(phone);
  const exists = await User.exists({ phone: normalized });
  // Дугаар бүртгэлтэй эсэхийг нууж, зөвхөн тохирох тохиолдолд л SMS илгээнэ.
  if ((purpose === 'register' && exists) || (purpose === 'reset' && !exists)) {
    return res.json({ sent: true, resendCooldownSeconds: 60 });
  }
  const r = await OtpService.send(normalized, purpose);
  res.json({ sent: true, ...r });
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, purpose, code } = parse(verifyOtpSchema, req.body);
  res.json({ verificationToken: await OtpService.verify(normalizePhone(phone), purpose, code) });
}

export async function register(req: Request, res: Response) {
  const { verificationToken, password, name } = parse(registerSchema, req.body);
  const phone = await OtpService.consumeVerification(verificationToken, 'register');
  const user = await AuthService.register(phone, password, name);
  await startSession(req, res, user);
  res.status(201).json({ user: AuthService.view(user) });
}

export async function resetPassword(req: Request, res: Response) {
  const { verificationToken, password } = parse(resetSchema, req.body);
  const phone = await OtpService.consumeVerification(verificationToken, 'reset');
  const user = await User.findOneAndUpdate({ phone }, { $set: { passwordHash: await hashPassword(password), failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } });
  if (!user) throw unauthorized();
  await AuthService.revokeUser(user._id);
  res.json({ ok: true });
}

export async function login(req: Request, res: Response) {
  const { phone, password } = parse(loginSchema, req.body);
  const user = await AuthService.login(normalizePhone(phone), password);
  await startSession(req, res, user);
  res.json({ user: AuthService.view(user) });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.mf_refresh;
  if (!token) throw unauthorized();
  try {
    const r = await AuthService.rotate(token, meta(req));
    setAuthCookies(res, AuthService.signAccess(r.user, r.familyId), r.refreshToken, r.expiresAt);
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

export async function updateProfile(req: Request, res: Response) {
  const { name } = parse(profileSchema, req.body);
  req.user!.name = name;
  await req.user!.save();
  res.json({ user: AuthService.view(req.user!) });
}
