import type { Types } from 'mongoose';
import { IPayment, ISubscription, Subscription, User } from '../models';
import { conflict, notFound } from '../utils/errors';
import { paymentPrice } from './subscriptionPricing.service';
import { SettingsService } from './settings.service';

const DAY = 86_400_000;
const MAX_SEQ_RETRIES = 10;

type PeriodFields = Pick<ISubscription, 'planCode' | 'amount' | 'currency'> & Partial<Pick<ISubscription, 'paymentId' | 'grantedBy' | 'note' | 'movieId'>>;

// movieId: null нь талбаргүй (бүх киноны) эрхийг ч олно.
const scopeOf = (movieId?: Types.ObjectId | null) => ({ movieId: movieId ?? null });

// Идэвхтэй эрх байвал дуусах огнооноос нь, үгүй бол `from`-оос эхэлнэ. Эхлээд дарааллыг уншдаг
// тул уншсаны дараа нэмэгдсэн эрх (userId, seq) unique индекс дээр мөргөлдөж, дахин тооцоологдоно.
// Бүх киноны эрх, кино тус бүрийн эрх өөр өөрийн дараалалд сунгагдана: нэг киноны эрх сарын эрхийг хойшлуулахгүй.
async function insertPeriod(userId: Types.ObjectId, from: Date, days: number, fields: PeriodFields) {
  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    const last = await Subscription.findOne({ userId }).sort({ seq: -1 }).select('seq').lean();
    const latest = await Subscription.findOne({ userId, ...scopeOf(fields.movieId), status: 'active', expiresAt: { $gt: from } }).sort({ expiresAt: -1 }).select('expiresAt').lean();
    const startedAt = latest ? latest.expiresAt : from;
    try {
      return await Subscription.create({
        ...fields, userId, seq: (last?.seq ?? 0) + 1, status: 'active', startedAt,
        expiresAt: new Date(startedAt.getTime() + days * DAY),
      });
    } catch (err) {
      if ((err as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000 && (err as { keyPattern?: Record<string, unknown> }).keyPattern?.seq) continue;
      throw err;
    }
  }
  throw conflict('Эрх үүсгэхэд зэрэгцээ хүсэлт хэт олон байна. Дахин оролдоно уу.');
}

export const SubscriptionService = {
  // Төлбөр бүрд яг нэг эрх. paymentId unique тул давтан болон зэрэгцээ дуудлага аюулгүй.
  // Хугацаа нь нэхэмжлэх үүсэх үеийн нөхцөлөөс (payment.durationDays) авна.
  async ensureForPayment(payment: IPayment, paidAt: Date) {
    const existing = await Subscription.findOne({ paymentId: payment._id });
    if (existing) return { sub: existing, created: false };
    try {
      const sub = await insertPeriod(payment.userId, paidAt, payment.durationDays, {
        planCode: payment.planCode, amount: paymentPrice(payment), currency: payment.currency, paymentId: payment._id,
        ...(payment.movieId ? { movieId: payment.movieId } : {}),
      });
      return { sub, created: true };
    } catch (err) {
      if ((err as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000 && (err as { keyPattern?: Record<string, unknown> }).keyPattern?.paymentId) {
        return { sub: (await Subscription.findOne({ paymentId: payment._id }))!, created: false };
      }
      throw err;
    }
  },

  async grantManually(userId: Types.ObjectId, days: number, adminId: Types.ObjectId, note: string) {
    if (!(await User.exists({ _id: userId }))) throw notFound('Хэрэглэгч олдсонгүй.');
    const { value } = await SettingsService.getEntry('subscription');
    return insertPeriod(userId, new Date(), days, { planCode: 'MANUAL', amount: 0, currency: value.currency, grantedBy: adminId, note });
  },

  // Бүх киноны эрхийн төлөв. Кино тус бүрийн эрхийг movieAccess() буцаана.
  async status(userId: Types.ObjectId, now = new Date()) {
    const active = await Subscription.find({ userId, ...scopeOf(null), status: 'active', expiresAt: { $gt: now } }).sort({ startedAt: 1 }).lean<ISubscription[]>();
    const current = active.find((s) => s.startedAt <= now) ?? null;
    return { current, expiresAt: current ? active[active.length - 1].expiresAt : null };
  },

  // Одоо хүчинтэй кино тус бүрийн эрх: кино бүрд сунгалтын дарааллын эцсийн дуусах огноо.
  async movieAccess(userId: Types.ObjectId, now = new Date()) {
    const active = await Subscription.find({ userId, movieId: { $type: 'objectId' }, status: 'active', expiresAt: { $gt: now } })
      .sort({ startedAt: 1 }).select('movieId startedAt expiresAt').lean<ISubscription[]>();
    const byMovie = new Map<string, { started: boolean; expiresAt: Date }>();
    for (const s of active) {
      const key = String(s.movieId);
      const prev = byMovie.get(key);
      byMovie.set(key, { started: (prev?.started ?? false) || s.startedAt <= now, expiresAt: prev && prev.expiresAt > s.expiresAt ? prev.expiresAt : s.expiresAt });
    }
    return [...byMovie].filter(([, v]) => v.started).map(([movieId, v]) => ({ movieId, expiresAt: v.expiresAt }));
  },

  // Тоглуулах эрхийн цорын ганц шийдвэр: бүх киноны эрх эсвэл энэ киноны эрх.
  // Дуусах огноог шууд шалгах тул expire job хоцорсон ч нэвтрүүлэхгүй.
  async hasAccess(userId: Types.ObjectId, movieId: Types.ObjectId, now = new Date()) {
    const { paymentRequired } = await SettingsService.get('subscription');
    if (!paymentRequired) return true;
    return !!(await Subscription.exists({
      userId, status: 'active', startedAt: { $lte: now }, expiresAt: { $gt: now }, movieId: { $in: [null, movieId] },
    }));
  },

  async expireDue(now = new Date()) {
    const r = await Subscription.updateMany({ status: 'active', expiresAt: { $lte: now } }, { $set: { status: 'expired' } });
    return r.modifiedCount;
  },

  view(s: ISubscription) {
    return {
      id: String(s._id), planCode: s.planCode, movieId: s.movieId ? String(s.movieId) : undefined, amount: s.amount, currency: s.currency, status: s.status,
      startedAt: s.startedAt, expiresAt: s.expiresAt, createdAt: s.createdAt,
    };
  },
};
