import { z } from 'zod';

const url = z.string().trim().max(1000).refine((v) => v === '' || /^(https?:\/\/|\/)/.test(v), 'http(s) хаяг эсвэл / -ээр эхэлсэн зам байх ёстой');

export const generalSchema = z.object({
  siteName: z.string().trim().min(1).max(60),
  logo: url.default(''),
  favicon: url.default(''),
  description: z.string().trim().max(300).default(''),
  maintenanceMode: z.boolean(),
});

export const planSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/, 'Кодод латин том үсэг, тоо, _ ашиглана'),
  name: z.string().trim().min(1).max(60),
  price: z.number().int('Үнэ бүхэл тоо байх ёстой').positive('Үнэ 0-ээс их байх ёстой'),
  durationDays: z.number().int().min(1).max(3660),
  enabled: z.boolean(),
});

export const subscriptionSchema = z.object({
  enabled: z.boolean(),
  paymentRequired: z.boolean(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Валютын 3 үсэгт код оруулна уу'),
  paymentExpiryMinutes: z.number().int().min(5).max(1440),
  plans: z.array(planSchema).min(1, 'Дор хаяж нэг багц байх ёстой'),
}).superRefine((v, ctx) => {
  const codes = v.plans.map((p) => p.code);
  if (new Set(codes).size !== codes.length) ctx.addIssue({ code: 'custom', path: ['plans'], message: 'Багцын код давхардсан байна' });
  if (v.enabled && !v.plans.some((p) => p.enabled)) ctx.addIssue({ code: 'custom', path: ['plans'], message: 'Идэвхтэй багц алга байна' });
});

export const videoSchema = z.object({
  storageRoot: z.string().trim().min(1),
  hlsResolutions: z.array(z.union([z.literal(2160), z.literal(1440), z.literal(1080), z.literal(720), z.literal(480), z.literal(360)])).min(1),
  ffmpeg: z.object({
    preset: z.enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow']),
    crf: z.number().int().min(16).max(32),
    segmentSeconds: z.number().int().min(2).max(12),
    threads: z.number().int().min(0).max(64),
  }),
  playbackTokenExpiryMinutes: z.number().int().min(1).max(1440),
});

export const securitySchema = z.object({
  sessionExpiryDays: z.number().int().min(1).max(365),
  loginMaxAttempts: z.number().int().min(3).max(50),
  loginLockMinutes: z.number().int().min(1).max(1440),
  allowedAdminIps: z.array(z.union([z.ipv4(), z.ipv6()])).max(100),
});

export const homepageSchema = z.object({
  heroBanners: z.array(z.object({
    title: z.string().trim().max(120).default(''),
    subtitle: z.string().trim().max(300).optional(),
    image: url.optional(),
    link: url.optional(),
    enabled: z.boolean(),
  }).refine((b) => b.title || b.image, { path: ['image'], message: 'Слайдад зураг эсвэл гарчиг оруулна уу' })).max(10),
  adBanners: z.array(z.object({
    image: url.refine(Boolean, 'Зарын зураг оруулна уу'),
    link: url.optional(),
    enabled: z.boolean(),
  })).max(10).default([]),
  catalogBanner: z.object({
    image: url,
    mobileImage: url.optional(),
    link: url.optional(),
    enabled: z.boolean(),
  }).refine((b) => !b.enabled || b.image, { path: ['image'], message: 'Баннерын зураг оруулна уу' }).default({ image: '', enabled: false }),
  featuredMovieIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(20),
  sections: z.array(z.object({
    key: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().trim().min(1).max(60),
    type: z.enum(['new', 'popular', 'continue', 'category']),
    categorySlug: z.string().optional(),
    visible: z.boolean(),
    order: z.number().int(),
  })).max(30),
});

export const settingSchemas = {
  general: generalSchema,
  subscription: subscriptionSchema,
  video: videoSchema,
  security: securitySchema,
  homepage: homepageSchema,
};
export type SettingKey = keyof typeof settingSchemas;
export type GeneralSettings = z.infer<typeof generalSchema>;
export type SubscriptionSettings = z.infer<typeof subscriptionSchema>;
export type VideoSettings = z.infer<typeof videoSchema>;
export type SecuritySettings = z.infer<typeof securitySchema>;
export type HomepageSettings = z.infer<typeof homepageSchema>;
export interface SettingValues {
  general: GeneralSettings; subscription: SubscriptionSettings; video: VideoSettings;
  security: SecuritySettings; homepage: HomepageSettings;
}
