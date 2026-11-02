import crypto from 'crypto';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { IPayment, Payment, Subscription } from '../models';
import { AppError, conflict, notFound } from '../utils/errors';
import { CheckResult, QPayGateway } from './qpay.gateway';
import { SubscriptionPricingService } from './subscriptionPricing.service';
import { SubscriptionService } from './subscription.service';

const QPAY_CURRENCY = 'MNT';
const USER_CHECK_COOLDOWN_MS = 10_000;
const REPAIR_WINDOW_MS = 30 * 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const newOrderNumber = () => `MF${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

export type VerifyOutcome = 'paid' | 'already_paid' | 'pending' | 'rejected' | 'unverifiable';

// Дүн/валют/дугаарыг нэхэмжлэхийн өөрчлөгдөшгүй утгатай тулгана.
function evaluate(p: IPayment, r: CheckResult): { outcome: 'paid' | 'pending' | 'rejected' | 'unverifiable'; reason?: string; note?: string } {
  if (r.invoiceId && r.invoiceId !== p.invoiceId) return { outcome: 'rejected', reason: 'INVOICE_MISMATCH' };
  if (r.status !== 'PAID') return { outcome: 'pending', note: `QPay төлөв: ${r.status ?? 'тодорхойгүй'}` };
  if (r.amount === null) return { outcome: 'unverifiable', note: 'QPay хариунд төлсөн дүн алга тул автоматаар баталгаажуулаагүй.' };
  if (r.amount !== p.amount) return { outcome: 'rejected', reason: 'AMOUNT_MISMATCH', note: `Хүлээгдсэн ${p.amount}, ирсэн ${r.amount}` };
  if (r.currency && r.currency !== p.currency) return { outcome: 'rejected', reason: 'CURRENCY_MISMATCH', note: `Хүлээгдсэн ${p.currency}, ирсэн ${r.currency}` };
  return { outcome: 'paid' };
}

export const PaymentService = {
  async create(userId: Types.ObjectId, planCode: string) {
    const quote = await SubscriptionPricingService.quote(planCode);
    QPayGateway.assertConfigured();
    const ref = QPayGateway.ref();
    // quickqpaypackv2 нэхэмжлэхийг үргэлж MNT-ээр үүсгэдэг.
    if (quote.currency !== QPAY_CURRENCY) {
      throw new AppError(503, 'CURRENCY_UNSUPPORTED', `QPay зөвхөн ${QPAY_CURRENCY} дэмждэг. Эрхийн валют: ${quote.currency}.`);
    }
    const now = new Date();

    // Ижил нөхцөлтэй хүчинтэй нэхэмжлэх байвал шинээр үүсгэлгүй түүнийг буцаана.
    const existing = await Payment.findOne({
      userId, status: 'pending', planCode, amount: quote.amount, currency: quote.currency,
      durationDays: quote.durationDays, qpayBaiguullagiinId: ref.baiguullagiinId, qpayBarilgiinId: ref.barilgiinId,
      invoiceId: { $type: 'string' }, expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
    if (existing) return existing;

    const payment = await Payment.create({
      userId, orderNumber: newOrderNumber(), amount: quote.amount, currency: quote.currency,
      planCode: quote.planCode, planName: quote.planName, durationDays: quote.durationDays, pricingVersion: quote.pricingVersion,
      qpayBaiguullagiinId: ref.baiguullagiinId, qpayBarilgiinId: ref.barilgiinId, status: 'pending',
      expiresAt: new Date(now.getTime() + quote.expiryMinutes * 60_000),
    });

    try {
      const invoice = await QPayGateway.createInvoice(ref, {
        amount: payment.amount,
        orderNumber: payment.orderNumber,
        description: `MongolFlix ${payment.planName} ${payment.orderNumber}`,
      });
      payment.invoiceId = invoice.invoiceId;
      payment.qr = invoice.qr;
      await payment.save();
      return payment;
    } catch (err) {
      payment.status = 'failed';
      payment.failureReason = 'INVOICE_CREATE_FAILED';
      payment.verificationNote = (err as Error).message.slice(0, 500);
      await payment.save();
      console.error(`[payment] нэхэмжлэх үүсгэж чадсангүй ${payment.orderNumber}:`, (err as Error).message);
      throw new AppError(502, 'QPAY_INVOICE_FAILED', 'QPay нэхэмжлэх үүсгэж чадсангүй. Түр хүлээгээд дахин оролдоно уу.');
    }
  },

  // Нэг удаа шалгаад тухайн үр дүнгээр төлөв шинэчилнэ. Нэхэмжлэх үүссэн тохиргооны хувилбарыг ашиглана.
  async verify(paymentId: Types.ObjectId): Promise<VerifyOutcome> {
    const payment = await Payment.findById(paymentId).lean<IPayment>();
    if (!payment) throw notFound('Төлбөр олдсонгүй.');
    if (payment.status === 'paid' && !payment.subscriptionId) {
      // Өмнөх оролдлого төлөв шинэчилснийхээ дараа тасарсан: эрхийг нөхөж дуусгана.
      await this.completeActivation(payment);
      return 'already_paid';
    }
    if (payment.status === 'paid' || payment.status === 'refunded') return 'already_paid';
    if (!payment.invoiceId) return 'pending';
    const result = await QPayGateway.checkInvoice({ baiguullagiinId: payment.qpayBaiguullagiinId, barilgiinId: payment.qpayBarilgiinId }, payment.invoiceId);
    await Payment.updateOne({ _id: payment._id }, { $set: { lastCheckAt: new Date() } });
    const v = evaluate(payment, result);

    if (v.outcome === 'pending' || v.outcome === 'unverifiable') {
      if (v.note) await Payment.updateOne({ _id: payment._id }, { $set: { verificationNote: v.note } });
      return v.outcome;
    }
    if (v.outcome === 'rejected') {
      await Payment.updateOne({ _id: payment._id, status: { $in: ['pending', 'expired'] } }, {
        $set: { status: 'failed', failureReason: v.reason, verificationNote: v.note, verifiedAt: new Date() },
      });
      console.error(`[payment] төлбөр татгалзав ${payment.orderNumber}: ${v.reason} ${v.note ?? ''}`);
      return 'rejected';
    }
    return (await this.applyPaid(payment._id, result.paymentId)) ? 'paid' : 'already_paid';
  },

  // Нөхцөлт шинэчлэлт нь давхар callback болон зэрэгцээ хүсэлтээс зөвхөн нэгийг нь нэвтрүүлнэ.
  // Дараагийн алхам тасарвал "paid, subscriptionId-гүй" төлөв үлдэж, verify эсвэл worker нөхнө.
  async applyPaid(id: Types.ObjectId, qpayPaymentId?: string) {
    const now = new Date();
    const payment = await Payment.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'expired'] } },
      { $set: { status: 'paid', paidAt: now, verifiedAt: now, paymentId: qpayPaymentId }, $unset: { failureReason: 1, verificationNote: 1 } },
      { new: true },
    ).lean<IPayment>();
    if (!payment) return false;
    await this.completeActivation(payment);
    return true;
  },

  // Давтаж дуудахад аюулгүй: эрх үүссэн бол дахин үүсгэхгүй.
  async completeActivation(payment: IPayment) {
    const { sub, created } = await SubscriptionService.ensureForPayment(payment, payment.paidAt ?? new Date());
    await Payment.updateOne({ _id: payment._id }, { $set: { subscriptionId: sub._id } });
    // Эрх аль хэдийн идэвхжсэн тул лавлах бичлэгийн алдаа төлбөрийн үр дүнд нөлөөлөхгүй.
    if (payment.invoiceId) {
      await QPayGateway.markInvoicePaid(payment.invoiceId, payment.paymentId).catch((err) => console.error('[payment] QuickQpayObject шинэчилж чадсангүй:', (err as Error).message));
    }
    return created;
  },

  // Worker дуудна. Сервер унасан зэргээр дуусаагүй алхмуудыг нөхнө.
  async repairIncomplete(now = new Date()) {
    const since = new Date(now.getTime() - REPAIR_WINDOW_MS);
    const incomplete = await Payment.find({ status: 'paid', subscriptionId: { $exists: false }, paidAt: { $gte: since } }).limit(100).lean<IPayment[]>();
    for (const p of incomplete) {
      await this.completeActivation(p);
    }
    const refunded = await Payment.find({ status: 'refunded', updatedAt: { $gte: since } }).select('_id').lean();
    const cancelled = await Subscription.updateMany({ paymentId: { $in: refunded.map((p) => p._id) }, status: 'active' }, { $set: { status: 'cancelled' } });
    return { activated: incomplete.length, cancelled: cancelled.modifiedCount };
  },

  // Callback нь QPay талын PAID төлөвөөс түрүүлж ирэх тохиолдол бий, мөн дахин
  // илгээгддэггүй тул богино завсартай хэд дахин шалгана.
  async verifyFromCallback(paymentId: Types.ObjectId): Promise<VerifyOutcome> {
    let last: VerifyOutcome = 'pending';
    for (let i = 0; i < env.QPAY_CHECK_RETRIES; i++) {
      if (i > 0) await sleep(env.QPAY_CHECK_RETRY_DELAY_MS);
      last = await this.verify(paymentId);
      if (last !== 'pending') return last;
    }
    return last;
  },

  // Хэрэглэгчийн "Төлбөр шалгах" товч. QPay-г хэт олон дуудахгүйн тулд cooldown-той.
  async userCheck(userId: Types.ObjectId, id: Types.ObjectId) {
    const payment = await Payment.findOne({ _id: id, userId });
    if (!payment) throw notFound('Төлбөр олдсонгүй.');
    if (payment.status === 'pending' && (!payment.lastCheckAt || Date.now() - payment.lastCheckAt.getTime() > USER_CHECK_COOLDOWN_MS)) {
      await this.verify(payment._id);
    }
    return (await Payment.findById(id).lean<IPayment>())!;
  },

  async expirePending(now = new Date()) {
    const r = await Payment.updateMany({ status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired' } });
    return r.modifiedCount;
  },

  // Бодит мөнгө буцаалт QPay/банкаар хийгдсэний дараа админ бүртгэнэ. Холбогдох эрхийг цуцална.
  async markRefunded(id: Types.ObjectId, adminId: Types.ObjectId, note: string) {
    const p = await Payment.findOneAndUpdate({ _id: id, status: 'paid' }, { $set: { status: 'refunded', refundedBy: adminId, refundNote: note } }).lean<IPayment>();
    if (!p) throw conflict('Зөвхөн төлөгдсөн төлбөрийг буцаасанд бүртгэнэ.');
    // Энэ алхам тасарвал repairIncomplete эрхийг цуцална.
    await Subscription.updateMany({ paymentId: id, status: 'active' }, { $set: { status: 'cancelled' } });
  },

  view(p: IPayment) {
    const open = p.status === 'pending';
    return {
      id: String(p._id), orderNumber: p.orderNumber, planCode: p.planCode, planName: p.planName, amount: p.amount, currency: p.currency,
      status: p.status, failureReason: p.failureReason, paidAt: p.paidAt, createdAt: p.createdAt, expiresAt: p.expiresAt,
      ...(open && p.qr ? { qr: { image: p.qr.image, text: p.qr.text, shortUrl: p.qr.shortUrl, urls: p.qr.urls ?? [] } } : {}),
    };
  },
};
