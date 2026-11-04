import { Types } from 'mongoose';
import { env } from '../config/env';
import { SystemSetting } from '../models';
import { conflict } from '../utils/errors';
import { parse } from '../utils/http';
import { GeneralSettings, SettingKey, SettingValues, settingSchemas } from './settings.schemas';

// Анхны утгууд зөвхөн энд байна: админ хадгалмагц баазын утга давуу эрхтэй болно.
export const defaults = (): SettingValues => ({
  general: { siteName: 'MongolFlix', logo: '', favicon: '', banner: '', description: 'Монгол хэл дээрх кино үзэх платформ', maintenanceMode: false },
  subscription: {
    enabled: true, paymentRequired: true, currency: 'MNT', paymentExpiryMinutes: 60,
    plans: [{ code: 'MONTHLY', name: 'Сарын эрх', price: 14900, durationDays: 30, enabled: true }],
  },
  video: {
    storageRoot: env.VIDEO_DEFAULT_ROOT, hlsResolutions: [1080, 720, 480],
    ffmpeg: { preset: 'veryfast', crf: 22, segmentSeconds: 6, threads: 0 },
    playbackTokenExpiryMinutes: 120,
  },
  security: { sessionExpiryDays: 30, loginMaxAttempts: 5, loginLockMinutes: 15, allowedAdminIps: [] },
});

interface Entry<K extends SettingKey> { value: SettingValues[K]; version: number; at: number }
const CACHE_TTL_MS = 30_000; // Олон процесс (API/worker) хооронд хоцрох дээд хугацаа.
const cache = new Map<SettingKey, Entry<SettingKey>>();

// Хуучин "Нүүр хуудас" табд оруулсан зургийг дахин оруулахгүйгээр баннер болгоно. Ерөнхий тохиргоог хадгалмагц banner нь өөрөө хадгалагдаж, энэ уншилт зогсоно.
async function legacyBanner() {
  const doc = await SystemSetting.findOne({ key: 'homepage' }).lean();
  const home = doc?.value as { catalogBanner?: { image?: string; enabled?: boolean }; adBanners?: { image?: string; enabled?: boolean }[] } | undefined;
  if (home?.catalogBanner?.enabled && home.catalogBanner.image) return home.catalogBanner.image;
  return home?.adBanners?.find((ad) => ad.enabled && ad.image)?.image ?? '';
}

export const SettingsService = {
  async getEntry<K extends SettingKey>(key: K, opts: { fresh?: boolean } = {}): Promise<{ value: SettingValues[K]; version: number }> {
    const hit = cache.get(key) as Entry<K> | undefined;
    if (hit && !opts.fresh && Date.now() - hit.at < CACHE_TTL_MS) return hit;
    const doc = await SystemSetting.findOne({ key }).lean();
    // Хадгалсны дараа нэмэгдсэн талбар хуучин баримтад байхгүй: анхны утгаар нөхнө.
    const value = { ...defaults()[key], ...doc?.value } as SettingValues[K];
    if (key === 'general' && (doc?.value as { banner?: string } | undefined)?.banner === undefined) (value as GeneralSettings).banner = await legacyBanner();
    const entry: Entry<K> = { value, version: doc?.version ?? 0, at: Date.now() };
    cache.set(key, entry as unknown as Entry<SettingKey>);
    return entry;
  },

  async get<K extends SettingKey>(key: K, opts: { fresh?: boolean } = {}) {
    return (await this.getEntry(key, opts)).value;
  },

  // expectedVersion зөрвөл хоёр админ зэрэг засварласныг илрүүлж 409 буцаана.
  async update<K extends SettingKey>(key: K, input: unknown, actorId: Types.ObjectId, expectedVersion?: number) {
    const value = parse(settingSchemas[key], input) as SettingValues[K];
    const before = await this.getEntry(key, { fresh: true });
    if (expectedVersion !== undefined && expectedVersion !== before.version) {
      throw conflict('Тохиргоог өөр админ өөрчилсөн байна. Хуудсаа шинэчилнэ үү.');
    }
    const doc = await SystemSetting.findOneAndUpdate(
      { key },
      { $set: { value, updatedBy: actorId }, $inc: { version: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    ).lean();
    cache.delete(key);
    return { before, after: { value, version: doc!.version } };
  },

  invalidate(key?: SettingKey) {
    if (key) cache.delete(key);
    else cache.clear();
  },

  async getPublic() {
    const [general, subscription] = await Promise.all([this.get('general'), this.get('subscription')]);
    // Энд зөвхөн нийтэд ил байж болох талбаруудыг нэг бүрчлэн сонгоно.
    return {
      general: { siteName: general.siteName, logo: general.logo, favicon: general.favicon, banner: general.banner, description: general.description, maintenanceMode: general.maintenanceMode },
      subscription: { enabled: subscription.enabled, paymentRequired: subscription.paymentRequired, currency: subscription.currency },
    };
  },
};
