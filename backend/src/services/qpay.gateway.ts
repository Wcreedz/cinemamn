import mongoose, { Connection } from 'mongoose';
import { env } from '../config/env';
import { AppError, unavailable } from '../utils/errors';

// QPay-н бүх дуудлага quickqpaypackv2 сангаар дамжина. Нэвтрэх мэдээллийг сан өөрөө удирдаж,
// merchant, дансыг баазын QpayKhariltsagch баримтаас уншина.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pack = () => require('quickqpaypackv2') as typeof import('quickqpaypackv2');

// MongolFlix-ийн төлбөр орох QpayKhariltsagch баримт, салбар (Cinema).
export const BAIGUULLAGIIN_ID = '612f457d185280db676d0b51';
export const BARILGIIN_ID = '622ca3938e64e5b4f0c36be9';

let packConn: Connection | null = null;

function kholbolt() {
  if (!env.QPAY_MONGODB_URI) return { kholbolt: mongoose.connection };
  packConn ??= mongoose.createConnection(env.QPAY_MONGODB_URI);
  return { kholbolt: packConn };
}

function ensureServer() {
  if (!env.QPAY_MERCHANT_SERVER) throw unavailable('QPAY_NOT_CONFIGURED', 'QPay төлбөр одоогоор тохируулагдаагүй байна.');
  // Сан хаягийг шууд залгадаг тул төгсгөлийн / заавал байх ёстой.
  process.env.QPAY_MERCHANT_SERVER = env.QPAY_MERCHANT_SERVER.replace(/\/*$/, '/');
}

// Сан харилцагч олдоогүй үед алдаа шидэхийн оронд мөр буцаадаг.
function assertObject(result: unknown): asserts result is Record<string, any> {
  if (!result || typeof result !== 'object') {
    throw new AppError(502, 'QPAY_MERCHANT_NOT_FOUND', typeof result === 'string' ? result : 'QPay-с хоосон хариу ирлээ.');
  }
}

export interface MerchantRef { baiguullagiinId: string; barilgiinId: string }

export interface InvoiceResult {
  invoiceId: string;
  qr: { image?: string; text?: string; shortUrl?: string; urls: { name: string; description?: string; logo?: string; link: string }[] };
}

export interface CheckResult { status: string | undefined; amount: number | null; currency: string | undefined; invoiceId: string | undefined; paymentId: string | undefined; raw: Record<string, any> }

// Нэхэмжлэх PAID үед QPay-н quickqr төлөлтийн мөр payment_status: 'SUCCESS' гэж буцаадаг.
const PAID_ROW_STATUSES = new Set(['PAID', 'SUCCESS']);

const toNumber = (v: unknown) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// payment/check-ийн хариунаас бодит төлөгдсөн дүнг гаргана. Төлөлтийн мөрүүд байвал тэдгээр нь
// л эх сурвалж болно: нэхэмжлэхийн `amount` нь төлөвлөсөн дүн болохоос төлсөн дүн биш.
export function parseCheckResponse(raw: Record<string, any>): CheckResult {
  const rows: any[] = Array.isArray(raw.payments) ? raw.payments : Array.isArray(raw.rows) ? raw.rows : [];
  const paidRows = rows.filter((r) => PAID_ROW_STATUSES.has(String(r.payment_status ?? r.status ?? 'PAID').toUpperCase()));
  const rowAmounts = paidRows.map((r) => toNumber(r.payment_amount ?? r.amount));
  const amount = rowAmounts.length && rowAmounts.every((a) => a !== null)
    ? (rowAmounts as number[]).reduce((s, a) => s + a, 0)
    : toNumber(raw.paid_amount ?? raw.gross_amount ?? raw.amount);
  const first = paidRows[0] ?? {};
  return {
    status: (raw.invoice_status ?? (paidRows.length ? 'PAID' : undefined))?.toString().toUpperCase(),
    amount,
    currency: (raw.currency ?? first.payment_currency ?? first.currency)?.toString().toUpperCase(),
    invoiceId: raw.id ?? raw.invoice_id,
    paymentId: first.payment_id ?? first.id,
    raw,
  };
}

export const QPayGateway = {
  ref(): MerchantRef {
    return { baiguullagiinId: BAIGUULLAGIIN_ID, barilgiinId: BARILGIIN_ID };
  },

  // Дутуу тохиргоотой үед төлбөрийн бичлэг үүсгэхээс өмнө зогсооно.
  assertConfigured() {
    if (!env.QPAY_MERCHANT_SERVER || !env.UNDSEN_SERVER) throw unavailable('QPAY_NOT_CONFIGURED', 'QPay төлбөр одоогоор тохируулагдаагүй байна.');
  },

  async createInvoice(ref: MerchantRef, o: { amount: number; orderNumber: string; description: string }): Promise<InvoiceResult> {
    ensureServer();
    const callbackUrl = `${env.UNDSEN_SERVER!.replace(/\/+$/, '')}/qpaycallback/${ref.baiguullagiinId}/${o.orderNumber}`;
    const res = await pack().qpayGargaya({
      baiguullagiinId: ref.baiguullagiinId,
      barilgiinId: ref.barilgiinId,
      dun: o.amount,
      tailbar: o.description,
      zakhialgiinDugaar: o.orderNumber,
    }, callbackUrl, kholbolt());
    assertObject(res);
    const invoiceId = res.id ?? res.invoice_id;
    if (!invoiceId) throw new AppError(502, 'QPAY_BAD_RESPONSE', 'QPay нэхэмжлэхийн дугаар буцаасангүй.');
    return {
      invoiceId,
      qr: {
        image: res.qr_image,
        text: res.qr_text ?? res.qr_code,
        shortUrl: res.qPay_shortUrl,
        urls: Array.isArray(res.urls) ? res.urls : [],
      },
    };
  },

  // Сангийн QuickQpayObject бичлэгийг tureesBack-ийн адил төлсөн болгоно.
  async markInvoicePaid(invoiceId: string, paymentId?: string) {
    await pack().QuickQpayObject(kholbolt()).updateOne(
      { invoice_id: invoiceId, tulsunEsekh: false },
      { $set: { tulsunEsekh: true, ...(paymentId ? { payment_id: paymentId } : {}) } },
    );
  },

  async checkInvoice(ref: MerchantRef, invoiceId: string): Promise<CheckResult> {
    ensureServer();
    const res = await pack().qpayShalgay({ baiguullagiinId: ref.baiguullagiinId, barilgiinId: ref.barilgiinId, id: invoiceId }, kholbolt());
    assertObject(res);
    return parseCheckResponse(res);
  },
};
