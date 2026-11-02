import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Otp } from '../models';
import { hmac, safeEqual } from '../utils/crypto';
import { AppError, badRequest, unauthorized } from '../utils/errors';
import { SmsConfigurationService } from './smsConfiguration.service';

export type OtpPurpose = 'register' | 'reset';
const hashCode = (phone: string, purpose: string, code: string) => hmac(`${phone}:${purpose}:${code}`, env.OTP_PEPPER);

export const OtpService = {
  async send(phone: string, purpose: OtpPurpose) {
    const cfg = await SmsConfigurationService.otpSettings();
    const last = await Otp.findOne({ phone, purpose }).sort({ createdAt: -1 }).lean();
    if (last) {
      const wait = cfg.resendCooldownSeconds - Math.floor((Date.now() - new Date((last as unknown as { createdAt: Date }).createdAt).getTime()) / 1000);
      if (wait > 0) throw new AppError(429, 'OTP_COOLDOWN', `Дахин код авахын тулд ${wait} секунд хүлээнэ үү.`, { retryAfter: wait });
    }
    // Provider бэлэн биш бол бичлэг үүсгэхгүй, алдааг шууд буцаана.
    const provider = await SmsConfigurationService.getProvider();
    const code = String(crypto.randomInt(100000, 1000000));
    await Otp.deleteMany({ phone, purpose, verifiedAt: { $exists: false } });
    const doc = await Otp.create({
      phone, purpose, otpHash: hashCode(phone, purpose, code),
      expiresAt: new Date(Date.now() + cfg.otpExpiryMinutes * 60_000), maxAttempts: cfg.maxAttempts,
    });
    try {
      await provider.send(phone, `MongolFlix баталгаажуулах код: ${code}. ${cfg.otpExpiryMinutes} минутын дотор хүчинтэй.`);
    } catch (err) {
      await Otp.deleteOne({ _id: doc._id });
      throw err;
    }
    return { resendCooldownSeconds: cfg.resendCooldownSeconds, expiresInMinutes: cfg.otpExpiryMinutes };
  },

  // Амжилттай бол бүртгэл/нууц үг сэргээхэд ашиглах богино хугацаатай баталгаа буцаана.
  async verify(phone: string, purpose: OtpPurpose, code: string) {
    // Зэрэгцээ таалтаас хамгаалж эхлээд оролдлогыг атомаар тоолно.
    const otp = await Otp.findOneAndUpdate(
      { phone, purpose, verifiedAt: { $exists: false }, expiresAt: { $gt: new Date() }, $expr: { $lt: ['$attempts', '$maxAttempts'] } },
      { $inc: { attempts: 1 } }, { new: true, sort: { createdAt: -1 } },
    );
    if (!otp) throw badRequest('Код хүчингүй эсвэл хугацаа нь дууссан байна. Шинэ код авна уу.');
    if (!safeEqual(otp.otpHash, hashCode(phone, purpose, code))) {
      const left = otp.maxAttempts - otp.attempts;
      throw new AppError(400, 'OTP_INVALID', left > 0 ? `Код буруу байна. ${left} оролдлого үлдлээ.` : 'Оролдлогын тоо дууслаа. Шинэ код авна уу.');
    }
    otp.verifiedAt = new Date();
    await otp.save();
    return jwt.sign({ phone, purpose, otp: String(otp._id) }, env.JWT_ACCESS_SECRET, { audience: 'otp-verified', expiresIn: '15m' });
  },

  // Баталгаа нь нэг удаагийнх: ашиглахад OTP бичлэг устаж дахин хэрэглэгдэхгүй.
  async consumeVerification(token: string, purpose: OtpPurpose) {
    let claims: { phone: string; purpose: string; otp: string };
    try {
      claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: 'otp-verified' }) as typeof claims;
    } catch {
      throw unauthorized('Утасны баталгаажуулалтын хугацаа дууссан байна. Дахин баталгаажуулна уу.');
    }
    if (claims.purpose !== purpose) throw unauthorized('Утасны баталгаажуулалт буруу байна.');
    const r = await Otp.deleteOne({ _id: claims.otp, phone: claims.phone, purpose });
    if (!r.deletedCount) throw unauthorized('Энэ баталгаажуулалтыг аль хэдийн ашигласан байна.');
    return claims.phone;
  },
};
