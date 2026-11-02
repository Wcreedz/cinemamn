import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { IQPayConfiguration, Payment, QPayConfiguration } from '../models';
import { AppError, conflict, forbidden, notFound, unavailable } from '../utils/errors';
import { QPayGateway, serverEnvironment } from './qpay.gateway';

export const qpayInputSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  merchantName: z.string().trim().min(1).max(120),
  baiguullagiinId: z.string().trim().min(1).max(64),
  salbariinId: z.string().trim().min(1).max(64),
  dansniiDugaar: z.string().trim().max(40).optional().default(''),
  callbackUrl: z.string().trim().url('Callback URL буруу байна'),
  currency: z.literal('MNT', { message: 'quickqpaypackv2 зөвхөн MNT дэмждэг' }),
  enabled: z.boolean(),
});
export type QPayInput = z.infer<typeof qpayInputSchema>;

type Candidate = Pick<IQPayConfiguration, 'environment' | 'baiguullagiinId' | 'salbariinId' | 'dansniiDugaar' | 'callbackUrl' | 'currency'>;
export interface Check { name: string; ok: boolean; message: string }

let cached: { doc: IQPayConfiguration | null; at: number } | null = null;
const TTL = 30_000;
const PROBE_INVOICE_ID = '00000000-0000-0000-0000-000000000000';

const canManage = (role: string, ...envs: (string | undefined)[]) => role === 'superadmin' || !envs.includes('production');

export const QPayConfigurationService = {
  async getCurrent(opts: { fresh?: boolean } = {}) {
    if (!opts.fresh && cached && Date.now() - cached.at < TTL) return cached.doc;
    const doc = await QPayConfiguration.findOne({ isCurrent: true }).sort({ version: -1 }).lean<IQPayConfiguration>();
    cached = { doc, at: Date.now() };
    return doc;
  },

  // Нэхэмжлэх дээр хадгалагдсан хувилбарыг олно. Хуучин хүлээгдэж буй нэхэмжлэх ч
  // тухайн үеийн тохиргоогоор шалгагдана.
  async getById(id: Types.ObjectId) {
    const doc = await QPayConfiguration.findById(id).lean<IQPayConfiguration>();
    if (!doc) throw notFound('Нэхэмжлэхэд холбогдох QPay тохиргооны хувилбар олдсонгүй.');
    return doc;
  },

  // Нэхэмжлэх үүсгэхэд: заавал идэвхтэй, тохирох орчинтой байх ёстой.
  async requireEnabled() {
    const cfg = await this.getCurrent({ fresh: true });
    if (!cfg || !cfg.enabled) throw unavailable('QPAY_DISABLED', 'QPay төлбөр одоогоор идэвхгүй байна.');
    const server = serverEnvironment();
    if (server !== cfg.environment) throw unavailable('QPAY_ENV_MISMATCH', 'QPay тохиргооны орчин серверийн хаягтай таарахгүй байна.');
    return cfg;
  },

  async save(input: QPayInput, actor: { _id: Types.ObjectId; role: string }) {
    const current = await this.getCurrent({ fresh: true });
    if (!canManage(actor.role, input.environment, current?.environment)) {
      throw forbidden('Production QPay тохиргоог зөвхөн Superadmin өөрчилнө.');
    }
    if (env.isProd && !input.callbackUrl.startsWith('https://')) throw new AppError(422, 'VALIDATION_ERROR', 'Production орчинд callback URL заавал https байна.');
    let checks: Check[] = [];
    if (input.enabled) {
      // Идэвхжүүлэхээс өмнө бодитоор шалгана. Амжилтгүй бол хадгалахгүй.
      checks = [...(await this.verifyMerchant(input)).checks, await this.testConnection(input)];
      const failed = checks.filter((c) => !c.ok);
      if (failed.length) throw new AppError(422, 'QPAY_VALIDATION_FAILED', `QPay идэвхжүүлэх боломжгүй: ${failed.map((c) => c.message).join('; ')}`, checks);
    }
    const last = await QPayConfiguration.findOne().sort({ version: -1 }).lean();
    let created: IQPayConfiguration;
    try {
      // version unique: зэрэг хадгалбал нэг нь л амжилттай болно.
      created = (await QPayConfiguration.create({ ...input, version: (last?.version ?? 0) + 1, isCurrent: true, createdBy: actor._id })).toObject() as IQPayConfiguration;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw conflict('Тохиргоог өөр админ зэрэг хадгалсан байна. Хуудсаа шинэчилнэ үү.');
      throw err;
    }
    await QPayConfiguration.updateMany({ isCurrent: true, version: { $lt: created.version } }, { $set: { isCurrent: false } });
    cached = null;
    return { config: created, previous: current, checks };
  },

  // Бодит дуудлага: санаар дамжуулж QPay-с токен авч, байхгүй нэхэмжлэхийг шалгана.
  // "Нэхэмжлэх олдсонгүй" гэсэн хариу нь нэвтрэлт амжилттай болсныг илтгэнэ.
  async testConnection(cfg: Candidate): Promise<Check> {
    const name = 'QPay холболт';
    const server = serverEnvironment();
    if (!server) return { name, ok: false, message: 'QPAY_MERCHANT_SERVER тохируулаагүй эсвэл орчин тодорхойгүй байна.' };
    if (server !== cfg.environment) return { name, ok: false, message: `Сервер ${server} орчин руу заасан байхад тохиргоо ${cfg.environment} байна.` };
    try {
      await QPayGateway.checkInvoice(cfg as IQPayConfiguration, PROBE_INVOICE_ID);
      return { name, ok: true, message: 'QPay сервертэй холбогдож, нэвтрэлт амжилттай боллоо.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/invoice[_ ]?not[_ ]?found|not.?found|олдсонгүй/i.test(message) && !/харилцагч|салбар|Байгууллага/i.test(message)) {
        return { name, ok: true, message: 'QPay сервертэй холбогдож, нэвтрэлт амжилттай боллоо.' };
      }
      return { name, ok: false, message: `QPay алдаа: ${message}` };
    }
  },

  // quickqpaypackv2-ийн QpayKhariltsagch бүтэц дээр тохиргоо зөв эсэхийг шалгана.
  async verifyMerchant(cfg: Candidate): Promise<{ ok: boolean; checks: Check[] }> {
    const checks: Check[] = [];
    const add = (name: string, ok: boolean, message: string) => { checks.push({ name, ok, message }); return ok; };
    const khariltsagch = await QPayGateway.merchants().findOne({ baiguullagiinId: cfg.baiguullagiinId }).lean();
    if (!add('Харилцагч', !!khariltsagch, khariltsagch ? `${khariltsagch.name ?? khariltsagch.first_name ?? ''} олдлоо.` : 'Энэ baiguullagiinId-тай QpayKhariltsagch олдсонгүй.')) return { ok: false, checks };
    const salbar = khariltsagch.salbaruud?.find((s: any) => s.salbariinId === cfg.salbariinId);
    if (!add('Салбар', !!salbar, salbar ? `${salbar.salbariinNer ?? cfg.salbariinId} олдлоо.` : 'Энэ salbariinId-тай салбар олдсонгүй.')) return { ok: false, checks };
    add('Данс', !!salbar.bank_accounts?.length, salbar.bank_accounts?.length ? `${salbar.bank_accounts.length} данс бүртгэлтэй.` : 'Салбарт данс бүртгэгдээгүй байна.');
    let dans: any = null;
    if (cfg.dansniiDugaar) {
      dans = salbar.bank_accounts?.find((a: any) => a.account_number === cfg.dansniiDugaar);
      add('Сонгосон данс', !!dans, dans ? 'Сонгосон данс олдлоо.' : 'Сонгосон данс салбарт бүртгэгдээгүй байна.');
    }
    const shimtgel = dans ? !!dans.qpayShimtgelTurul : !!salbar.qpayShimtgelTurul;
    const field = shimtgel ? 'merchant_idTrue' : 'merchant_idFalse';
    const merchantId = dans?.[field] || salbar[field] || khariltsagch[field];
    add('Merchant ID', !!merchantId, merchantId ? `${field} тохируулагдсан.` : `${field} бүртгэгдээгүй байна.`);
    // Сан нэхэмжлэхийг дансны төрлөөр, харин шалгалтыг салбар=true үед true токеноор хийдэг.
    // Ийм хослолд QPay-н шалгалт өөр эрхээр явж, төлбөр баталгаажихгүй.
    if (dans) {
      const mismatch = !!salbar.qpayShimtgelTurul && !dans.qpayShimtgelTurul;
      add('Шимтгэлийн төрөл', !mismatch, mismatch ? 'Салбар шимтгэлтэй атал сонгосон данс шимтгэлгүй байна. Төлбөр шалгалт өөр эрхээр явах тул энэ хослолыг ашиглах боломжгүй.' : 'Нэхэмжлэх болон шалгалт ижил эрхээр явна.');
    }
    return { ok: checks.every((c) => c.ok), checks };
  },

  listVersions() {
    return QPayConfiguration.find().sort({ version: -1 }).limit(50).lean<IQPayConfiguration[]>();
  },

  // Хүлээгдэж буй нэхэмжлэх хамаарч буй, эсвэл төлбөр холбогдсон хувилбарыг устгахгүй.
  async deleteVersion(id: Types.ObjectId) {
    const cfg = await this.getById(id);
    if (cfg.isCurrent) throw conflict('Одоогийн хувилбарыг устгах боломжгүй.');
    const used = await Payment.countDocuments({ qpayConfigurationId: id });
    if (used) throw conflict(`Энэ хувилбарт ${used} төлбөр холбогдсон тул устгах боломжгүй.`);
    await QPayConfiguration.deleteOne({ _id: id });
  },

  invalidate() { cached = null; },
};
