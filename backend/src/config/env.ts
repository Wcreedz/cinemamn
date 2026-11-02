import path from 'path';
import { z } from 'zod';

const base64Key = z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
  message: 'base64-ээр кодолсон яг 32 байт түлхүүр байх ёстой (openssl rand -base64 32)',
});
const secret = z.string().min(32, 'хамгийн багадаа 32 тэмдэгт байх ёстой');
const csv = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4100),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/mongolflix'),
  // quickqpaypackv2-ийн QpayKhariltsagch/token цуглуулгууд өөр бааз дээр байвал зааж өгнө.
  QPAY_MONGODB_URI: z.string().optional(),
  // quickqpaypackv2 энэ хувьсагчаас QPay серверийн хаягийг уншдаг.
  QPAY_MERCHANT_SERVER: z.string().url().optional(),
  // merchant.qpay.mn / merchant-sandbox.qpay.mn-ээс өөр хаяг (жишээ нь тест сервер) дээр заавал зааж өгнө.
  QPAY_SERVER_ENV: z.enum(['sandbox', 'production']).optional(),
  QPAY_CHECK_RETRIES: z.coerce.number().int().min(1).default(3),
  QPAY_CHECK_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(3000),
  JWT_ACCESS_SECRET: secret,
  PLAYBACK_TOKEN_SECRET: secret,
  OTP_PEPPER: secret,
  INTERNAL_AUTH_SECRET: secret,
  SETTINGS_ENCRYPTION_KEY: base64Key,
  CORS_ORIGINS: z.string().default('http://localhost:3100'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  PUBLIC_VIDEO_BASE_URL: z.string().url().default('http://localhost:4100'),
  PUBLIC_MEDIA_BASE_URL: z.string().url().default('http://localhost:4100/media'),
  SERVE_HLS_FROM_API: z.enum(['true', 'false']).default('false'),
  VIDEO_DEFAULT_ROOT: z.string().default(path.resolve(process.cwd(), '../video-server/storage')),
  // Админ хянах самбараас сонгож болох storage root-ууд. Энэ жагсаалтаас гадуур бичихгүй.
  VIDEO_ALLOWED_ROOTS: z.string().optional(),
  // Гүйцэтгэх файлын замыг вэбээс өөрчлүүлбэл админ сервер дээр код ажиллуулах боломжтой
  // болох тул зөвхөн орчны хувьсагчаар тохируулна.
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Орчны хувьсагчийн тохиргоо буруу байна (.env.example-г харна уу):\n${lines}`);
}
const e = parsed.data;

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  corsOrigins: csv(e.CORS_ORIGINS),
  cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
  serveHlsFromApi: e.SERVE_HLS_FROM_API === 'true',
  videoAllowedRoots: csv(e.VIDEO_ALLOWED_ROOTS).length ? csv(e.VIDEO_ALLOWED_ROOTS) : [e.VIDEO_DEFAULT_ROOT],
};
