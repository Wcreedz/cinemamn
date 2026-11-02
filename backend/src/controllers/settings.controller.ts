import type { Request, Response } from 'express';
import { AdminLog } from '../models';
import { logAdmin } from '../services/adminLog.service';
import { SettingKey, VideoSettings } from '../services/settings.schemas';
import { SettingsService } from '../services/settings.service';
import { VideoConfigurationService } from '../services/videoConfiguration.service';
import { env } from '../config/env';
import { forbidden } from '../utils/errors';
import { paged, pageQuery, parse } from '../utils/http';
import { z } from 'zod';

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

export async function publicSettings(_req: Request, res: Response) {
  res.json(await SettingsService.getPublic());
}
