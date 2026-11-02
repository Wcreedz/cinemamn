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

// Хэрэглэгч олдоогүй үед ч ижил хугацаа зарцуулж дугаар бүртгэлтэй эсэхийг нуух dummy hash.
const dummyHash = argon2.hash(crypto.randomBytes(16).toString('hex'), ARGON);

export const hashPassword = (password: string) => argon2.hash(password, ARGON);

export interface Meta { ip?: string; userAgent?: string }

export const AuthService = {
  signAccess(user: Pick<IUser, '_id' | 'role'>, familyId: string) {
    return jwt.sign({ sub: String(user._id), role: user.role, fam: familyId }, env.JWT_ACCESS_SECRET, { audience: 'access', expiresIn: ACCESS_TTL_SECONDS });
  },

  async issueSession(userId: Types.ObjectId, meta: Meta, familyId: string = crypto.randomUUID()) {
    const { sessionExpiryDays } = await SettingsService.get('security');
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + sessionExpiryDays * 86_400_000);
    await RefreshSession.create({ userId, familyId, tokenHash: sha256(refreshToken), expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 200) });
    return { refreshToken, familyId, expiresAt };
  },

  async register(phone: string, password: string, name: string) {
    if (await User.exists({ phone })) throw new AppError(409, 'PHONE_TAKEN', 'Энэ дугаараар бүртгэл үүссэн байна. Нэвтэрнэ үү.');
    return User.create({ phone, passwordHash: await hashPassword(password), name, phoneVerified: true });
  },

  async login(phone: string, password: string): Promise<HydratedDocument<IUser>> {
    const user = await User.findOne({ phone }).select('+passwordHash');
    if (!user) {
      await argon2.verify(await dummyHash, password);
      throw unauthorized(INVALID_LOGIN);
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
      throw unauthorized(INVALID_LOGIN);
    }
    if (user.status === 'blocked') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Таны бүртгэл хаагдсан байна. Админтай холбогдоно уу.');
    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } });
    return user;
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
    const next = await this.issueSession(user._id, meta, session.familyId);
    return { user, ...next };
  },

  revokeFamily: (familyId: string) => RefreshSession.updateMany({ familyId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }),
  revokeUser: (userId: Types.ObjectId) => RefreshSession.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }),

  view(u: IUser) {
    return { id: String(u._id), phone: u.phone, name: u.name, role: u.role, status: u.status, phoneVerified: u.phoneVerified, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
  },
};
