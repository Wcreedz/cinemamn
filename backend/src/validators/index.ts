import { z } from 'zod';
import { objectId } from '../utils/http';

export const phoneField = z.string().trim().min(8).max(20);
export const passwordField = z.string().min(8, 'Нууц үг дор хаяж 8 тэмдэгт байна').max(128);

export const sendOtpSchema = z.object({ phone: phoneField, purpose: z.enum(['register', 'reset']).default('register') });
export const verifyOtpSchema = z.object({ phone: phoneField, purpose: z.enum(['register', 'reset']).default('register'), code: z.string().regex(/^\d{6}$/, '6 оронтой код оруулна уу') });
export const registerSchema = z.object({ verificationToken: z.string().min(10), password: passwordField, name: z.string().trim().max(80).default('') });
export const resetSchema = z.object({ verificationToken: z.string().min(10), password: passwordField });
export const loginSchema = z.object({ phone: phoneField, password: z.string().min(1).max(128) });
export const profileSchema = z.object({ name: z.string().trim().max(80) });

export const movieInput = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Slug-д латин жижиг үсэг, тоо, зураас ашиглана').max(200),
  originalTitle: z.string().trim().max(200).optional(),
  description: z.string().max(5000).default(''),
  poster: z.string().trim().max(1000).optional(),
  backdrop: z.string().trim().max(1000).optional(),
  trailerUrl: z.string().trim().url().or(z.literal('')).optional(),
  duration: z.number().int().min(0).optional(),
  releaseYear: z.number().int().min(1888).max(2100).optional(),
  genres: z.array(objectId).default([]),
  cast: z.array(z.string().trim().max(120)).default([]),
  director: z.string().trim().max(120).optional(),
  language: z.string().trim().max(60).optional(),
  country: z.string().trim().max(60).optional(),
  isPublished: z.boolean().default(false),
  featured: z.boolean().default(false),
});
export const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(60),
  description: z.string().max(500).optional(),
  image: z.string().trim().max(1000).optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export const movieQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  category: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.coerce.number().int().optional(),
  sort: z.enum(['new', 'popular', 'title']).default('new'),
});
export const createPaymentSchema = z.object({ planCode: z.string().regex(/^[A-Z0-9_]{2,20}$/).default('MONTHLY') });
export const watchProgressSchema = z.object({ progressSeconds: z.number().min(0), durationSeconds: z.number().min(0), completed: z.boolean().optional() });
export const extendSchema = z.object({ days: z.number().int().min(1).max(3660), note: z.string().trim().min(1, 'Шалтгаан бичнэ үү').max(500) });
export const refundSchema = z.object({ note: z.string().trim().min(1, 'Шалтгаан бичнэ үү').max(500) });
export const userStatusSchema = z.object({ status: z.enum(['active', 'blocked']) });
export const adminCreateSchema = z.object({ phone: phoneField, password: passwordField.optional(), name: z.string().trim().max(80).default(''), role: z.enum(['admin', 'superadmin']) });
export const adminRoleSchema = z.object({ role: z.enum(['user', 'admin', 'superadmin']) });
export const smsTestSchema = z.object({ phone: phoneField });
export const merchantInput = z.object({
  type: z.enum(['COMPANY', 'PERSON']),
  baiguullagiinId: z.string().trim().min(1),
  register_number: z.string().trim().min(1),
  name: z.string().trim().optional(),
  first_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
  mcc_code: z.string().trim().min(1),
  city: z.string().trim().min(1),
  district: z.string().trim().min(1),
  address: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email(),
  salbaruud: z.array(z.object({
    salbariinId: z.string().trim().min(1),
    salbariinNer: z.string().trim().min(1),
    qpayShimtgelTurul: z.boolean().default(false),
    bank_accounts: z.array(z.object({
      account_bank_code: z.string().trim().regex(/^(\d{6}|TOKI)$/),
      account_number: z.string().trim().min(1),
      account_name: z.string().trim().min(1),
      qpayShimtgelTurul: z.boolean().default(false),
    })).min(1),
  })).min(1),
});
