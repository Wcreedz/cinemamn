import mongoose, { Connection } from 'mongoose';
import { env } from '../config/env';
import { AppError, unavailable } from '../utils/errors';
import type { IQPayConfiguration } from '../models';

// QPay-н бүх дуудлага quickqpaypackv2 сангаар дамжина. Сан нь нэвтрэх мэдээллээ өөрөө
// удирддаг тул MongolFlix зөвхөн харилцагчийн лавлагаа болон дүнг дамжуулна.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pack = () => require('quickqpaypackv2') as typeof import('quickqpaypackv2');

let packConn: Connection | null = null;

function kholbolt() {
  if (!env.QPAY_MONGODB_URI) return { kholbolt: mongoose.connection };
  packConn ??= mongoose.createConnection(env.QPAY_MONGODB_URI);
  return { kholbolt: packConn };
}

export function serverEnvironment(): 'sandbox' | 'production' | null {
  if (env.QPAY_SERVER_ENV) return env.QPAY_SERVER_ENV;
  if (!env.QPAY_MERCHANT_SERVER) return null;
  const host = new URL(env.QPAY_MERCHANT_SERVER).hostname;
  if (host === 'merchant.qpay.mn') return 'production';
  if (host === 'merchant-sandbox.qpay.mn') return 'sandbox';
  return null;
}

function ensureServer() {
  if (!env.QPAY_MERCHANT_SERVER) throw unavailable('QPAY_SERVER_MISSING', 'QPAY_MERCHANT_SERVER орчны хувьсагч тохируулаагүй байна.');
  // Сан хаягийг шууд залгадаг тул төгсгөлийн / заавал байх ёстой.
  process.env.QPAY_MERCHANT_SERVER = env.QPAY_MERCHANT_SERVER.replace(/\/*$/, '/');
}

// Сан харилцагч олдоогүй үед алдаа шидэхийн оронд мөр буцаадаг.
function assertObject(result: unknown): asserts result is Record<string, any> {
  if (!result || typeof result !== 'object') {
    throw new AppError(502, 'QPAY_MERCHANT_NOT_FOUND', typeof result === 'string' ? result : 'QPay-с хоосон хариу ирлээ.');
  }
}

export interface InvoiceResult {
  invoiceId: string;
  qr: { image?: string; text?: string; shortUrl?: string; urls: { name: string; description?: string; logo?: string; link: string }[] };
}

export interface CheckResult { status: string | undefined; amount: number | null; currency: string | undefined; invoiceId: string | undefined; paymentId: string | undefined; raw: Record<string, any> }

const toNumber = (v: unknown) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// payment/check-ийн хариунаас бодит төлөгдсөн дүнг гаргана. Төлөлтийн мөрүүд байвал тэдгээр нь
// л эх сурвалж болно: нэхэмжлэхийн `amount` нь төлөвлөсөн дүн болохоос төлсөн дүн биш.
export function parseCheckResponse(raw: Record<string, any>): CheckResult {
  const rows: any[] = Array.isArray(raw.payments) ? raw.payments : Array.isArray(raw.rows) ? raw.rows : [];
  const paidRows = rows.filter((r) => String(r.payment_status ?? r.status ?? 'PAID').toUpperCase() === 'PAID');
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
  async createInvoice(cfg: IQPayConfiguration, o: { amount: number; orderNumber: string; description: string; callbackUrl: string }): Promise<InvoiceResult> {
    ensureServer();
    const res = await pack().qpayGargaya({
      baiguullagiinId: cfg.baiguullagiinId,
      barilgiinId: cfg.salbariinId,
      dansniiDugaar: cfg.dansniiDugaar || undefined,
      dun: o.amount,
      tailbar: o.description,
      zakhialgiinDugaar: o.orderNumber,
    }, o.callbackUrl, kholbolt());
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

  async checkInvoice(cfg: IQPayConfiguration, invoiceId: string): Promise<CheckResult> {
    ensureServer();
    const res = await pack().qpayShalgay({
      baiguullagiinId: cfg.baiguullagiinId,
      barilgiinId: cfg.salbariinId,
      dansniiDugaar: cfg.dansniiDugaar || undefined,
      id: invoiceId,
    }, kholbolt());
    assertObject(res);
    return parseCheckResponse(res);
  },

  merchants: () => pack().QpayKhariltsagch(kholbolt()),

  async saveMerchant(input: Record<string, unknown>) {
    ensureServer();
    const res = await pack().qpayKhariltsagchUusgey(input, kholbolt());
    if (res !== 'Amjilttai') throw new AppError(502, 'QPAY_MERCHANT_SAVE_FAILED', typeof res === 'string' ? res : 'QPay харилцагч хадгалахад алдаа гарлаа.');
  },
};
