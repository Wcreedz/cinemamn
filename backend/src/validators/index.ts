import { z } from 'zod';
import { objectId } from '../utils/http';

const PHONE_ERROR = 'Утасны дугаар буруу байна. 8 оронтой Монгол дугаар оруулна уу.';
export const phoneField = z.string({ error: 'Утасны дугаараа оруулна уу.' }).trim().min(8, PHONE_ERROR).max(20, PHONE_ERROR);
// Урт, бүтцийн шаардлага тавихгүй. Дээд хязгаар нь хэт урт утгаар hash-ийг ачааллуулахаас сэргийлнэ.
export const passwordField = z.string({ error: 'Нууц үгээ оруулна уу.' }).min(1, 'Нууц үгээ оруулна уу.').max(128, 'Нууц үг хэт урт байна.');

export const registerSchema = z.object({ phone: phoneField, password: passwordField, name: z.string().trim().max(80).default('') });
export const loginSchema = z.object({ phone: phoneField, password: z.string().min(1).max(128) });
export const emailField = z.string().trim().toLowerCase().max(254).email('Имэйл хаяг буруу байна');
export const adminLoginSchema = z.object({ email: emailField, password: z.string().min(1).max(128), remember: z.boolean().default(false) });
export const resetPasswordSchema = z.object({ phone: phoneField, password: passwordField, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Нууц үг таарахгүй байна.' });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordField });
export const profileSchema = z.object({ name: z.string().trim().max(80) });

export const movieInput = z.object({
  title: z.string().trim().min(1).max(200),
  // Заагаагүй бол шинэ кинонд гарчгаас үүснэ, засахад хуучин нь хэвээр үлдэж холбоос эвдрэхгүй.
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Slug-д латин жижиг үсэг, тоо, зураас ашиглана').max(200).optional(),
  originalTitle: z.string().trim().max(200).optional(),
  description: z.string().max(5000).default(''),
  poster: z.string().trim().max(1000).optional(),
  backdrop: z.string().trim().max(1000).optional(),
  trailerUrl: z.string().trim().url().or(z.literal('')).optional(),
  duration: z.number().int().min(0).optional(),
  releaseYear: z.number().int().min(1888).max(2100).optional(),
  genres: z.array(objectId).default([]),
  // Маягтад байхгүй: default([]) байвал засах бүрт хуучин утгыг устгана. Шинэ кинонд model-ийн default үйлчилнэ.
  cast: z.array(z.string().trim().max(120)).optional(),
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
export const adminCreateSchema = z.object({ email: emailField, phone: phoneField, password: passwordField.optional(), name: z.string().trim().max(80).default(''), role: z.enum(['admin', 'superadmin']) });
export const adminRoleSchema = z.object({ role: z.enum(['user', 'admin', 'superadmin']) });
export const userPasswordSchema = z.object({ password: passwordField });
