import argon2 from 'argon2';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { HydratedDocument, Types } from 'mongoose';
import { env } from '../config/env';
import { IUser, RefreshSession, User } from '../models';
import { randomToken, sha256 } from '../utils/crypto';
import { AppError, unauthorized } from '../utils/errors';
import { SettingsService } from './settings.service';

export const ACCESS_TTL_SECONDS = 15 * 60;
const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const INVALID_LOGIN = 'Утасны дугаар эсвэл нууц үг буруу байна.';
const INVALID_ADMIN_LOGIN = 'Имэйл эсвэл нууц үг буруу байна.';
const SHORT_SESSION_DAYS = 1;

// Хэрэглэгч олдоогүй үед ч ижил хугацаа зарцуулж дугаар бүртгэлтэй эсэхийг нуух dummy hash.
const dummyHash = argon2.hash(crypto.randomBytes(16).toString('hex'), ARGON);

export const hashPassword = (password: string) => argon2.hash(password, ARGON);

export interface Meta { ip?: string; userAgent?: string }

export const AuthService = {
  signAccess(user: Pick<IUser, '_id' | 'role'>, familyId: string) {
    return jwt.sign({ sub: String(user._id), role: user.role, fam: familyId }, env.JWT_ACCESS_SECRET, { audience: 'access', expiresIn: ACCESS_TTL_SECONDS });
  },

  async issueSession(userId: Types.ObjectId, meta: Meta, opts: { familyId?: string; persistent?: boolean } = {}) {
    const { sessionExpiryDays } = await SettingsService.get('security');
    const familyId = opts.familyId ?? crypto.randomUUID();
    const persistent = opts.persistent ?? true;
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + (persistent ? sessionExpiryDays : SHORT_SESSION_DAYS) * 86_400_000);
    await RefreshSession.create({ userId, familyId, persistent, tokenHash: sha256(refreshToken), expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 200) });
    return { refreshToken, familyId, expiresAt, persistent };
  },

  async register(phone: string, password: string, name: string) {
    if (await User.exists({ phone })) throw new AppError(409, 'PHONE_TAKEN', 'Энэ дугаараар бүртгэл үүссэн байна. Нэвтэрнэ үү.');
    return User.create({ phone, passwordHash: await hashPassword(password), name });
  },

  // Хэрэглэгч утсаар, админ имэйлээр: эрхийн ангиллыг хайлтад оруулснаар нөгөө замаар нэвтрэхгүй.
  login(phone: string, password: string) {
    return this.authenticate({ phone, role: 'user' }, password, INVALID_LOGIN);
  },
  loginAdmin(email: string, password: string) {
    return this.authenticate({ email, role: { $in: ['admin', 'superadmin'] } }, password, INVALID_ADMIN_LOGIN);
  },

  async authenticate(query: Record<string, unknown>, password: string, invalid: string): Promise<HydratedDocument<IUser>> {
    const user = await User.findOne(query).select('+passwordHash');
    if (!user) {
      await argon2.verify(await dummyHash, password);
      throw unauthorized(invalid);
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new AppError(429, 'ACCOUNT_LOCKED', 'Олон удаа буруу оролдсон тул бүртгэл түр түгжигдлээ. Дараа дахин оролдоно уу.');
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      const sec = await SettingsService.get('security');
      const attempts = user.failedLoginAttempts + 1;
      const locked = attempts >= sec.loginMaxAttempts;
      await User.updateOne({ _id: user._id }, locked
        ? { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + sec.loginLockMinutes * 60_000) } }
        : { $set: { failedLoginAttempts: attempts } });
      throw unauthorized(invalid);
    }
    if (user.status === 'blocked') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Таны бүртгэл хаагдсан байна. Админтай холбогдоно уу.');
    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } });
    return user;
  },

  // Амжилттай бол бусад бүх төхөөрөмжийн сешн хаагдана.
  async changePassword(userId: Types.ObjectId, current: string, next: string) {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user || !(await argon2.verify(user.passwordHash, current))) throw new AppError(400, 'WRONG_PASSWORD', 'Одоогийн нууц үг буруу байна.');
    user.passwordHash = await hashPassword(next);
    await user.save();
    await this.revokeUser(userId);
  },

  // Refresh token rotation: хуучин токен дахин ирвэл хулгайд алдсан гэж үзэж бүх гэр бүлийг хаана.
  async rotate(token: string, meta: Meta) {
    const hash = sha256(token);
    const session = await RefreshSession.findOneAndUpdate(
      { tokenHash: hash, replacedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { replacedAt: new Date() } },
    );
    if (!session) {
      const reused = await RefreshSession.findOne({ tokenHash: hash, replacedAt: { $exists: true } }).lean();
      if (reused) await this.revokeFamily(reused.familyId);
      throw unauthorized('Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.');
    }
    const user = await User.findById(session.userId);
    if (!user || user.status !== 'active') throw unauthorized('Нэвтрэх эрхгүй байна.');
    const next = await this.issueSession(user._id, meta, { familyId: session.familyId, persistent: session.persistent !== false });
    return { user, ...next };
  },

  revokeFamily: (familyId: string) => RefreshSession.updateMany({ familyId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }),
  revokeUser: (userId: Types.ObjectId) => RefreshSession.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }),

  view(u: IUser) {
    return { id: String(u._id), phone: u.phone, email: u.email, name: u.name, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
  },
};
