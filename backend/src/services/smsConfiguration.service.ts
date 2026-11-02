import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { ISmsConfiguration, SmsConfiguration } from '../models';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto';
import { AppError, conflict, unavailable } from '../utils/errors';
import { HttpSmsProvider, MockSmsProvider, SmsProvider } from './sms.provider';

export const smsInputSchema = z.object({
  provider: z.enum(['http', 'mock']),
  apiUrl: z.string().trim().url().or(z.literal('')).optional(),
  apiKey: z.string().max(500).optional(), // хоосон бол өмнөх утгаа хадгална
  apiSecret: z.string().max(500).optional(),
  senderId: z.string().trim().max(30).optional(),
  enabled: z.boolean(),
  otpExpiryMinutes: z.number().int().min(1).max(60),
  resendCooldownSeconds: z.number().int().min(0).max(3600),
  maxAttempts: z.number().int().min(1).max(20),
});
export type SmsInput = z.infer<typeof smsInputSchema>;

const CTX_KEY = 'sms.apiKey';
const CTX_SECRET = 'sms.apiSecret';
const DEFAULT_OTP = { otpExpiryMinutes: 5, resendCooldownSeconds: 60, maxAttempts: 5 };

let cached: { doc: ISmsConfiguration | null; at: number } | null = null;
const TTL = 30_000;

export function buildProvider(cfg: ISmsConfiguration): SmsProvider {
  if (cfg.provider === 'mock') {
    if (env.isProd) throw unavailable('SMS_NOT_CONFIGURED', 'Production орчинд mock SMS ашиглах боломжгүй.');
    return new MockSmsProvider();
  }
  if (!cfg.apiUrl) throw unavailable('SMS_NOT_CONFIGURED', 'SMS үйлчилгээний хаяг тохируулаагүй байна.');
  return new HttpSmsProvider({
    apiUrl: cfg.apiUrl,
    apiKey: cfg.apiKeyEncrypted ? decryptSecret(cfg.apiKeyEncrypted, CTX_KEY) : undefined,
    apiSecret: cfg.apiSecretEncrypted ? decryptSecret(cfg.apiSecretEncrypted, CTX_SECRET) : undefined,
    senderId: cfg.senderId,
  });
}

export const SmsConfigurationService = {
  async getCurrent(opts: { fresh?: boolean } = {}) {
    if (!opts.fresh && cached && Date.now() - cached.at < TTL) return cached.doc;
    const doc = await SmsConfiguration.findOne({ isCurrent: true }).sort({ version: -1 }).lean<ISmsConfiguration>();
    cached = { doc, at: Date.now() };
    return doc;
  },

  async otpSettings() {
    const c = await this.getCurrent();
    return c ? { otpExpiryMinutes: c.otpExpiryMinutes, resendCooldownSeconds: c.resendCooldownSeconds, maxAttempts: c.maxAttempts } : DEFAULT_OTP;
  },

  // Тохируулаагүй бол production дээр алдаа өгнө: SMS илгээсэн мэт дүр эсгэхгүй.
  async getProvider(): Promise<SmsProvider> {
    const cfg = await this.getCurrent();
    if (cfg?.enabled) return buildProvider(cfg);
    if (!env.isProd && !cfg) return new MockSmsProvider();
    throw unavailable('SMS_NOT_CONFIGURED', 'SMS үйлчилгээ тохируулагдаагүй байна. Админтай холбогдоно уу.');
  },

  async save(input: SmsInput, actorId: Types.ObjectId) {
    if (input.provider === 'mock' && env.isProd) throw new AppError(422, 'VALIDATION_ERROR', 'Production орчинд mock SMS сонгох боломжгүй.');
    if (input.provider === 'http' && !input.apiUrl) throw new AppError(422, 'VALIDATION_ERROR', 'SMS үйлчилгээний API хаягаа оруулна уу.');
    if (input.provider === 'http' && env.isProd && !input.apiUrl!.startsWith('https://')) throw new AppError(422, 'VALIDATION_ERROR', 'Production орчинд SMS API заавал https байна.');
    const prev = await SmsConfiguration.findOne({ isCurrent: true }).sort({ version: -1 }).lean<ISmsConfiguration>();
    const last = await SmsConfiguration.findOne().sort({ version: -1 }).lean();
    let created: ISmsConfiguration;
    try {
      created = (await SmsConfiguration.create({
        provider: input.provider, apiUrl: input.apiUrl || undefined, senderId: input.senderId, enabled: input.enabled,
        otpExpiryMinutes: input.otpExpiryMinutes, resendCooldownSeconds: input.resendCooldownSeconds, maxAttempts: input.maxAttempts,
        apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey, CTX_KEY) : prev?.apiKeyEncrypted,
        apiKeyMask: input.apiKey ? maskSecret(input.apiKey) : prev?.apiKeyMask,
        apiSecretEncrypted: input.apiSecret ? encryptSecret(input.apiSecret, CTX_SECRET) : prev?.apiSecretEncrypted,
        apiSecretMask: input.apiSecret ? maskSecret(input.apiSecret) : prev?.apiSecretMask,
        version: (last?.version ?? 0) + 1, isCurrent: true, createdBy: actorId,
      })).toObject() as ISmsConfiguration;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw conflict('Тохиргоог өөр админ зэрэг хадгалсан байна. Хуудсаа шинэчилнэ үү.');
      throw err;
    }
    await SmsConfiguration.updateMany({ isCurrent: true, version: { $lt: created.version } }, { $set: { isCurrent: false } });
    cached = null;
    return created;
  },

  // API-д гаргах цорын ганц дүрслэл: шифрлэгдсэн талбарууд хэзээ ч гарахгүй.
  view(c: ISmsConfiguration | null) {
    if (!c) return { configured: false, ...DEFAULT_OTP, provider: env.isProd ? 'http' : 'mock', enabled: false, apiUrl: '', senderId: '', apiKeyMasked: '', apiSecretMasked: '', version: 0 };
    return {
      configured: true, version: c.version, provider: c.provider, apiUrl: c.apiUrl ?? '', senderId: c.senderId ?? '', enabled: c.enabled,
      otpExpiryMinutes: c.otpExpiryMinutes, resendCooldownSeconds: c.resendCooldownSeconds, maxAttempts: c.maxAttempts,
      apiKeyMasked: c.apiKeyMask ?? '', apiSecretMasked: c.apiSecretMask ?? '', updatedAt: c.updatedAt,
    };
  },

  invalidate() { cached = null; },
};
