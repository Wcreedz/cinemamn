import { Types } from 'mongoose';
import { env } from '../config/env';
import { SystemSetting } from '../models';
import { conflict } from '../utils/errors';
import { parse } from '../utils/http';
import { SettingKey, SettingValues, settingSchemas } from './settings.schemas';

// Анхны утгууд зөвхөн энд байна: админ хадгалмагц баазын утга давуу эрхтэй болно.
const section = (key: string, title: string, type: 'new' | 'popular' | 'continue' | 'category', order: number, categorySlug?: string) =>
  ({ key, title, type, order, visible: true, ...(categorySlug ? { categorySlug } : {}) });

export const defaults = (): SettingValues => ({
  general: { siteName: 'MongolFlix', logo: '', favicon: '', description: 'Монгол хэл дээрх кино үзэх платформ', maintenanceMode: false },
  subscription: {
    enabled: true, paymentRequired: true, currency: 'MNT', paymentExpiryMinutes: 60,
    plans: [{ code: 'MONTHLY', name: 'Сарын эрх', price: 14900, durationDays: 30, enabled: true }],
  },
  video: {
    storageRoot: env.VIDEO_DEFAULT_ROOT, hlsResolutions: [1080, 720, 480], maxUploadSizeMb: 20480,
    ffmpeg: { preset: 'veryfast', crf: 22, segmentSeconds: 6, threads: 0 },
    playbackTokenExpiryMinutes: 120,
  },
  security: { sessionExpiryDays: 30, loginMaxAttempts: 5, loginLockMinutes: 15, allowedAdminIps: [] },
  homepage: {
    heroBanners: [], featuredMovieIds: [],
    sections: [
      section('new', 'Шинээр нэмэгдсэн', 'new', 1),
      section('mongol', 'Монгол кино', 'category', 2, 'mongol'),
      section('adventure', 'Адал явдалт', 'category', 3, 'adventure'),
      section('comedy', 'Инээдмийн', 'category', 4, 'comedy'),
      section('drama', 'Драм', 'category', 5, 'drama'),
      section('horror', 'Аймшиг', 'category', 6, 'horror'),
      section('popular', 'Түгээмэл үзэлттэй', 'popular', 7),
      section('continue', 'Үргэлжлүүлэн үзэх', 'continue', 8),
    ],
  },
});

interface Entry<K extends SettingKey> { value: SettingValues[K]; version: number; at: number }
const CACHE_TTL_MS = 30_000; // Олон процесс (API/worker) хооронд хоцрох дээд хугацаа.
const cache = new Map<SettingKey, Entry<SettingKey>>();

export const SettingsService = {
  async getEntry<K extends SettingKey>(key: K, opts: { fresh?: boolean } = {}): Promise<{ value: SettingValues[K]; version: number }> {
    const hit = cache.get(key) as Entry<K> | undefined;
    if (hit && !opts.fresh && Date.now() - hit.at < CACHE_TTL_MS) return hit;
    const doc = await SystemSetting.findOne({ key }).lean();
    const entry: Entry<K> = { value: (doc?.value ?? defaults()[key]) as SettingValues[K], version: doc?.version ?? 0, at: Date.now() };
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
    const [general, subscription, homepage] = await Promise.all([this.get('general'), this.get('subscription'), this.get('homepage')]);
    // Энд зөвхөн нийтэд ил байж болох талбаруудыг нэг бүрчлэн сонгоно.
    return {
      general: { siteName: general.siteName, logo: general.logo, favicon: general.favicon, description: general.description, maintenanceMode: general.maintenanceMode },
      homepage: { heroBanners: homepage.heroBanners.filter((b) => b.enabled), featuredMovieIds: homepage.featuredMovieIds, sections: homepage.sections },
      subscription: { enabled: subscription.enabled, paymentRequired: subscription.paymentRequired, currency: subscription.currency },
    };
  },
};
