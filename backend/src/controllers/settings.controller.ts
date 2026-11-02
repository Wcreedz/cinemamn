import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AdminLog, IQPayConfiguration } from '../models';
import { logAdmin } from '../services/adminLog.service';
import { QPayGateway, serverEnvironment } from '../services/qpay.gateway';
import { qpayInputSchema, QPayConfigurationService } from '../services/qpayConfiguration.service';
import { SettingKey, VideoSettings } from '../services/settings.schemas';
import { SettingsService } from '../services/settings.service';
import { buildProvider, smsInputSchema, SmsConfigurationService } from '../services/smsConfiguration.service';
import { MockSmsProvider } from '../services/sms.provider';
import { VideoConfigurationService } from '../services/videoConfiguration.service';
import { env } from '../config/env';
import { AppError, badRequest, forbidden } from '../utils/errors';
import { objectId, paged, pageQuery, parse } from '../utils/http';
import { normalizePhone } from '../utils/phone';
import { merchantInput, smsTestSchema } from '../validators';
import { z } from 'zod';

const qpayView = (c: IQPayConfiguration | null) => c && ({
  id: String(c._id), version: c.version, environment: c.environment, merchantName: c.merchantName, baiguullagiinId: c.baiguullagiinId,
  salbariinId: c.salbariinId, dansniiDugaar: c.dansniiDugaar ?? '', callbackUrl: c.callbackUrl, currency: c.currency,
  enabled: c.enabled, isCurrent: c.isCurrent, createdAt: c.createdAt,
});
const maskAccount = (v?: string) => (v ? `••••${v.slice(-4)}` : '');

export async function getAll(_req: Request, res: Response) {
  const keys: SettingKey[] = ['general', 'subscription', 'video', 'security', 'homepage'];
  const entries = await Promise.all(keys.map((k) => SettingsService.getEntry(k, { fresh: true })));
  const body: Record<string, unknown> = {};
  keys.forEach((k, i) => { body[k] = { value: entries[i].value, version: entries[i].version }; });
  res.json({ ...body, videoAllowedRoots: env.videoAllowedRoots });
}

async function applyUpdate(req: Request, res: Response, key: SettingKey) {
  const { value, expectedVersion } = parse(z.object({ value: z.unknown(), expectedVersion: z.number().int().optional() }), req.body);
  if (key === 'video') {
    const next = value as VideoSettings;
    const current = await VideoConfigurationService.get({ fresh: true });
    // Хадгалах замын өөрчлөлт нь серверийн файлын системд нөлөөлнө.
    if (next?.storageRoot !== current.storageRoot) {
      if (req.user!.role !== 'superadmin') throw forbidden('Видео хадгалах замыг зөвхөн Superadmin өөрчилнө.');
      VideoConfigurationService.assertAllowedRoot(String(next?.storageRoot));
    }
  }
  const r = await SettingsService.update(key, value, req.user!._id, expectedVersion);
  await logAdmin(req, `settings.${key}.update`, { type: 'SystemSetting' }, { before: r.before.value, after: r.after.value, version: r.after.version });
  res.json(r.after);
}
export const updateSection = (key: SettingKey) => (req: Request, res: Response) => applyUpdate(req, res, key);

// PUT /api/admin/settings { section, value }
export async function updateAny(req: Request, res: Response) {
  const { section } = parse(z.object({ section: z.enum(['general', 'subscription', 'video', 'security', 'homepage']) }), req.body);
  return applyUpdate(req, res, section);
}

export async function history(req: Request, res: Response) {
  const q = parse(pageQuery, req.query);
  const filter = { action: { $regex: '^settings\\.' } };
  const [items, total] = await Promise.all([
    AdminLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('adminId', 'phone name').lean(),
    AdminLog.countDocuments(filter),
  ]);
  res.json(paged(items, total, q.page, q.limit));
}

export async function getQPay(req: Request, res: Response) {
  const [current, versions] = await Promise.all([QPayConfigurationService.getCurrent({ fresh: true }), QPayConfigurationService.listVersions()]);
  res.json({
    current: qpayView(current),
    versions: versions.map(qpayView),
    server: { url: env.QPAY_MERCHANT_SERVER ?? null, environment: serverEnvironment() },
    canEditProduction: req.user!.role === 'superadmin',
    credentialsSource: 'quickqpaypackv2',
  });
}

export async function saveQPay(req: Request, res: Response) {
  const input = parse(qpayInputSchema, req.body);
  const r = await QPayConfigurationService.save(input, req.user!);
  await logAdmin(req, 'settings.qpay.save', { type: 'QPayConfiguration', id: r.config._id }, { before: qpayView(r.previous), after: qpayView(r.config), checks: r.checks });
  res.status(201).json({ current: qpayView(r.config), checks: r.checks });
}

async function candidateOrCurrent(body: unknown) {
  const hasBody = body && typeof body === 'object' && Object.keys(body).length > 0;
  if (hasBody) return parse(qpayInputSchema, body);
  const c = await QPayConfigurationService.getCurrent({ fresh: true });
  if (!c) throw badRequest('QPay тохиргоо хадгалагдаагүй байна.');
  return c;
}

export async function testQPay(req: Request, res: Response) {
  const cfg = await candidateOrCurrent(req.body);
  const result = await QPayConfigurationService.testConnection(cfg);
  await logAdmin(req, 'settings.qpay.test', { type: 'QPayConfiguration' }, result);
  res.status(result.ok ? 200 : 502).json(result);
}

export async function verifyQPay(req: Request, res: Response) {
  const cfg = await candidateOrCurrent(req.body);
  const result = await QPayConfigurationService.verifyMerchant(cfg);
  await logAdmin(req, 'settings.qpay.verify', { type: 'QPayConfiguration' }, result);
  res.json(result);
}

export async function deleteQPayVersion(req: Request, res: Response) {
  const id = new Types.ObjectId(parse(objectId, req.params.id));
  await QPayConfigurationService.deleteVersion(id);
  await logAdmin(req, 'settings.qpay.delete_version', { type: 'QPayConfiguration', id });
  res.json({ ok: true });
}

export async function getMerchant(req: Request, res: Response) {
  const cfg = await QPayConfigurationService.getCurrent({ fresh: true });
  const id = String(req.query.baiguullagiinId ?? cfg?.baiguullagiinId ?? '');
  if (!/^[\w-]{1,64}$/.test(id)) return res.json({ merchant: null });
  const m = await QPayGateway.merchants().findOne({ baiguullagiinId: id }).lean();
  if (!m) return res.json({ merchant: null });
  const full = req.user!.role === 'superadmin';
  res.json({
    merchant: {
      type: m.type, baiguullagiinId: m.baiguullagiinId, register_number: m.register_number, name: m.name, first_name: m.first_name, last_name: m.last_name,
      mcc_code: m.mcc_code, city: m.city, district: m.district, address: m.address, phone: m.phone, email: m.email,
      hasMerchantTrue: !!m.merchant_idTrue, hasMerchantFalse: !!m.merchant_idFalse,
      salbaruud: (m.salbaruud ?? []).map((s: any) => ({
        salbariinId: s.salbariinId, salbariinNer: s.salbariinNer, qpayShimtgelTurul: !!s.qpayShimtgelTurul,
        bank_accounts: (s.bank_accounts ?? []).map((a: any) => ({
          account_bank_code: a.account_bank_code, account_name: a.account_name, qpayShimtgelTurul: !!a.qpayShimtgelTurul,
          account_number: full ? a.account_number : maskAccount(a.account_number),
        })),
      })),
    },
  });
}

// Багцын qpayKhariltsagchUusgey-г дуудаж QPay дээр бодитоор бүртгэнэ.
export async function saveMerchant(req: Request, res: Response) {
  const input = parse(merchantInput, req.body);
  await QPayGateway.saveMerchant(input);
  await logAdmin(req, 'settings.qpay.merchant_save', { type: 'QpayKhariltsagch' }, { baiguullagiinId: input.baiguullagiinId, salbar: input.salbaruud.length });
  res.json({ ok: true });
}

export async function getSms(_req: Request, res: Response) {
  res.json(SmsConfigurationService.view(await SmsConfigurationService.getCurrent({ fresh: true })));
}

export async function saveSms(req: Request, res: Response) {
  const input = parse(smsInputSchema, req.body);
  const before = await SmsConfigurationService.getCurrent({ fresh: true });
  const created = await SmsConfigurationService.save(input, req.user!._id);
  const view = SmsConfigurationService.view(created);
  await logAdmin(req, 'settings.sms.save', { type: 'SmsConfiguration', id: created._id }, { before: SmsConfigurationService.view(before), after: view });
  res.status(201).json(view);
}

export async function testSms(req: Request, res: Response) {
  const { phone } = parse(smsTestSchema, req.body);
  const cfg = await SmsConfigurationService.getCurrent({ fresh: true });
  const provider = cfg ? buildProvider(cfg) : env.isProd ? null : new MockSmsProvider();
  if (!provider) throw new AppError(503, 'SMS_NOT_CONFIGURED', 'SMS тохиргоо хадгалагдаагүй байна.');
  try {
    await provider.send(normalizePhone(phone), 'MongolFlix: SMS тохиргооны туршилтын мессеж.');
    await logAdmin(req, 'settings.sms.test', { type: 'SmsConfiguration', id: cfg?._id }, { ok: true, provider: provider.name });
    res.json({ ok: true, provider: provider.name, message: `${provider.name} үйлчилгээгээр илгээлээ.` });
  } catch (err) {
    const message = (err as Error).message;
    await logAdmin(req, 'settings.sms.test', { type: 'SmsConfiguration', id: cfg?._id }, { ok: false, provider: provider.name, message });
    res.status(502).json({ ok: false, provider: provider.name, message });
  }
}

export async function publicSettings(_req: Request, res: Response) {
  res.json(await SettingsService.getPublic());
}
