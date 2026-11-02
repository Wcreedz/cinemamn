import type { Types } from 'mongoose';
import { IPayment, ISubscription, Subscription, User } from '../models';
import { conflict, notFound } from '../utils/errors';
import { SettingsService } from './settings.service';

const DAY = 86_400_000;
const MAX_SEQ_RETRIES = 10;

type PeriodFields = Pick<ISubscription, 'planCode' | 'amount' | 'currency'> & Partial<Pick<ISubscription, 'paymentId' | 'grantedBy' | 'note'>>;

// Идэвхтэй эрх байвал дуусах огнооноос нь, үгүй бол `from`-оос эхэлнэ. Эхлээд дарааллыг уншдаг
// тул уншсаны дараа нэмэгдсэн эрх (userId, seq) unique индекс дээр мөргөлдөж, дахин тооцоологдоно.
async function insertPeriod(userId: Types.ObjectId, from: Date, days: number, fields: PeriodFields) {
  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    const last = await Subscription.findOne({ userId }).sort({ seq: -1 }).select('seq').lean();
    const latest = await Subscription.findOne({ userId, status: 'active', expiresAt: { $gt: from } }).sort({ expiresAt: -1 }).select('expiresAt').lean();
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
        planCode: payment.planCode, amount: payment.amount, currency: payment.currency, paymentId: payment._id,
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

  async status(userId: Types.ObjectId, now = new Date()) {
    const active = await Subscription.find({ userId, status: 'active', expiresAt: { $gt: now } }).sort({ startedAt: 1 }).lean<ISubscription[]>();
    const current = active.find((s) => s.startedAt <= now) ?? null;
    return { current, expiresAt: current ? active[active.length - 1].expiresAt : null };
  },

  // Тоглуулах эрхийн цорын ганц шийдвэр. Дуусах огноог шууд шалгах тул expire job хоцорсон ч нэвтрүүлэхгүй.
  async hasAccess(userId: Types.ObjectId, now = new Date()) {
    const { paymentRequired } = await SettingsService.get('subscription');
    if (!paymentRequired) return true;
    return !!(await this.status(userId, now)).current;
  },

  async expireDue(now = new Date()) {
    const r = await Subscription.updateMany({ status: 'active', expiresAt: { $lte: now } }, { $set: { status: 'expired' } });
    return r.modifiedCount;
  },

  view(s: ISubscription) {
    return {
      id: String(s._id), planCode: s.planCode, amount: s.amount, currency: s.currency, status: s.status,
      startedAt: s.startedAt, expiresAt: s.expiresAt, createdAt: s.createdAt,
    };
  },
};
