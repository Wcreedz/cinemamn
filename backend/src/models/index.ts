import { Schema, model, Types } from 'mongoose';

// quickqpaypackv2 нь mongoose.pluralize(null) дууддаг тул цуглуулгын нэрийг бүгдэд нь
// тодорхой зааж, ачаалах дарааллаас хамаарахгүй болгов.
const opts = (collection: string) => ({ collection, timestamps: true });
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name });

// ---------- User ----------
export interface IUser {
  _id: Types.ObjectId; phone: string; email?: string; passwordHash: string; name: string;
  role: 'user' | 'admin' | 'superadmin'; status: 'active' | 'blocked';
  failedLoginAttempts: number; lockUntil?: Date; lastLoginAt?: Date; createdAt: Date; updatedAt: Date;
}
const userSchema = new Schema<IUser>({
  phone: { type: String, required: true, unique: true, match: /^\+976[6-9]\d{7}$/ },
  // Админ эрхтэй хүн имэйлээр нэвтэрнэ. Энгийн хэрэглэгчид хэрэггүй.
  email: { type: String, lowercase: true, trim: true, maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, default: '', trim: true, maxlength: 80 },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  lastLoginAt: Date,
}, opts('users'));
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ role: 1, status: 1 });
export const User = model<IUser>('User', userSchema);

// ---------- RefreshSession (зөвхөн hash хадгална) ----------
const refreshSchema = new Schema({
  userId: { ...ref('User'), required: true },
  familyId: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  // false: "Намайг сануул" сонгоогүй, cookie хөтөч хаагдахад устана.
  persistent: { type: Boolean, default: true },
  revokedAt: Date,
  replacedAt: Date,
  userAgent: String,
  ipAddress: String,
}, opts('refresh_sessions'));
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSchema.index({ familyId: 1 });
refreshSchema.index({ userId: 1 });
export const RefreshSession = model('RefreshSession', refreshSchema);

// ---------- Category ----------
const categorySchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, match: /^[a-z0-9-]+$/ },
  description: String,
  image: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, opts('categories'));
categorySchema.index({ isActive: 1, sortOrder: 1 });
export const Category = model('Category', categorySchema);

// ---------- Movie ----------
const movieSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, match: /^[a-z0-9-]+$/ },
  originalTitle: String,
  description: { type: String, default: '' },
  poster: String,
  backdrop: String,
  trailerUrl: String,
  videoSource: { type: String, select: false }, // эх файлын зам: хэзээ ч гадагш гаргахгүй
  hlsPath: { type: String, select: false },
  videoStatus: { type: String, enum: ['none', 'uploading', 'queued', 'processing', 'ready', 'failed'], default: 'none' },
  videoError: String,
  videoProgress: { type: Number, min: 0, max: 100 },
  videoUploadSeconds: Number,
  videoProcessSeconds: Number,
  duration: { type: Number, min: 0 },
  releaseYear: { type: Number, min: 1888, max: 2100 },
  genres: [ref('Category')],
  cast: { type: [String], default: [] },
  director: String,
  language: String,
  country: String,
  isPublished: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  viewCount: { type: Number, default: 0, min: 0 },
}, opts('movies'));
// `language` талбар нь Mongo-гийн text index-ийн override-тай давхцахаас сэргийлж өөр нэр зааж өгөв.
movieSchema.index({ title: 'text', description: 'text' }, { default_language: 'none', language_override: 'textLanguage' });
movieSchema.index({ isPublished: 1, genres: 1 });
movieSchema.index({ isPublished: 1, createdAt: -1 });
movieSchema.index({ isPublished: 1, viewCount: -1 });
movieSchema.index({ isPublished: 1, featured: 1 });
export const Movie = model('Movie', movieSchema);

// ---------- Subscription ----------
export interface ISubscription {
  _id: Types.ObjectId; userId: Types.ObjectId; seq: number; planCode: string; amount: number; currency: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled'; startedAt: Date; expiresAt: Date;
  paymentId?: Types.ObjectId; grantedBy?: Types.ObjectId; note?: string; createdAt: Date; updatedAt: Date;
}
const subscriptionSchema = new Schema<ISubscription>({
  userId: { ...ref('User'), required: true },
  seq: { type: Number, required: true, min: 1 },
  planCode: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  status: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], required: true },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  paymentId: ref('Payment'),
  grantedBy: ref('User'),
  note: String,
}, opts('subscriptions'));
subscriptionSchema.index({ userId: 1, status: 1 });
// Хэрэглэгчийн эрхүүдийн дараалал. Зэрэгцээ хоёр төлбөр ижил дуусах огнооноос эхлэхийг хориглоно.
subscriptionSchema.index({ userId: 1, seq: 1 }, { unique: true });
subscriptionSchema.index({ expiresAt: 1 });
// Нэг төлбөрөөс хоёр эрх үүсэхийг өгөгдлийн сангийн түвшинд хориглоно.
subscriptionSchema.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'objectId' } } });
export const Subscription = model<ISubscription>('Subscription', subscriptionSchema);

// ---------- Payment ----------
export interface IPayment {
  _id: Types.ObjectId; userId: Types.ObjectId; orderNumber: string; invoiceId?: string; paymentId?: string;
  provider: 'qpay'; amount: number; currency: string; planCode: string; planName: string; durationDays: number;
  pricingVersion: number; qpayBaiguullagiinId: string; qpayBarilgiinId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'; failureReason?: string;
  subscriptionId?: Types.ObjectId; paidAt?: Date; verifiedAt?: Date; expiresAt?: Date; lastCheckAt?: Date;
  verificationNote?: string; refundedBy?: Types.ObjectId; refundNote?: string;
  qr?: { image?: string; text?: string; shortUrl?: string; urls?: { name: string; description?: string; logo?: string; link: string }[] };
  createdAt: Date; updatedAt: Date;
}
const paymentSchema = new Schema<IPayment>({
  userId: { ...ref('User'), required: true, immutable: true },
  orderNumber: { type: String, required: true, unique: true, immutable: true },
  invoiceId: String,
  paymentId: String,
  provider: { type: String, enum: ['qpay'], default: 'qpay', immutable: true },
  // Үнэ/тохиргоо өөрчлөгдсөн ч үүссэн нэхэмжлэхийн нөхцөл хэзээ ч өөрчлөгдөхгүй.
  amount: { type: Number, required: true, min: 1, immutable: true },
  currency: { type: String, required: true, immutable: true },
  planCode: { type: String, required: true, immutable: true },
  planName: { type: String, required: true, immutable: true },
  durationDays: { type: Number, required: true, min: 1, immutable: true },
  pricingVersion: { type: Number, required: true, immutable: true },
  // Код дахь ID солигдсон ч хүлээгдэж буй нэхэмжлэх үүссэн merchant-аараа шалгагдана.
  qpayBaiguullagiinId: { type: String, required: true, immutable: true },
  qpayBarilgiinId: { type: String, required: true, immutable: true },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'expired', 'refunded'], default: 'pending' },
  failureReason: String,
  subscriptionId: ref('Subscription'),
  paidAt: Date,
  verifiedAt: Date,
  expiresAt: Date,
  lastCheckAt: Date,
  verificationNote: String,
  refundedBy: ref('User'),
  refundNote: String,
  qr: {
    image: String, text: String, shortUrl: String,
    urls: [{ _id: false, name: String, description: String, logo: String, link: String }],
  },
}, opts('payments'));
paymentSchema.index({ invoiceId: 1 }, { unique: true, partialFilterExpression: { invoiceId: { $type: 'string' } } });
paymentSchema.index({ paymentId: 1 }, { partialFilterExpression: { paymentId: { $type: 'string' } } });
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
export const Payment = model<IPayment>('Payment', paymentSchema);

// ---------- WatchHistory ----------
const watchSchema = new Schema({
  userId: { ...ref('User'), required: true },
  movieId: { ...ref('Movie'), required: true },
  progressSeconds: { type: Number, default: 0, min: 0 },
  durationSeconds: { type: Number, default: 0, min: 0 },
  completed: { type: Boolean, default: false },
  lastWatchedAt: { type: Date, default: Date.now },
}, opts('watch_history'));
watchSchema.index({ userId: 1, movieId: 1 }, { unique: true });
watchSchema.index({ userId: 1, lastWatchedAt: -1 });
export const WatchHistory = model('WatchHistory', watchSchema);

// ---------- PlaybackSession ----------
const playbackSchema = new Schema({
  userId: { ...ref('User'), required: true },
  movieId: { ...ref('Movie'), required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  ipAddress: String,
}, opts('playback_sessions'));
playbackSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
playbackSchema.index({ userId: 1, movieId: 1 });
export const PlaybackSession = model('PlaybackSession', playbackSchema);

// ---------- AdminLog ----------
const adminLogSchema = new Schema({
  adminId: { ...ref('User'), required: true },
  action: { type: String, required: true },
  targetType: String,
  targetId: Schema.Types.ObjectId,
  metadata: Schema.Types.Mixed,
  ipAddress: String,
}, { collection: 'admin_logs', timestamps: { createdAt: true, updatedAt: false } });
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
export const AdminLog = model('AdminLog', adminLogSchema);

// ---------- SystemSetting ----------
const systemSettingSchema = new Schema({
  key: { type: String, required: true, unique: true, enum: ['general', 'subscription', 'video', 'security', 'homepage'] },
  value: { type: Schema.Types.Mixed, required: true },
  version: { type: Number, required: true, default: 1 },
  updatedBy: ref('User'),
}, opts('system_settings'));
export const SystemSetting = model('SystemSetting', systemSettingSchema);

// ---------- VideoJob (FFmpeg дарааллын ажил) ----------
const videoJobSchema = new Schema({
  movieId: { ...ref('Movie'), required: true },
  sourcePath: { type: String, required: true },
  status: { type: String, enum: ['queued', 'processing', 'ready', 'failed'], default: 'queued' },
  error: String,
  attempts: { type: Number, default: 0 },
  // Серверийн орчноос болж амжилтгүй болсон: эх файл хадгалагдсан, дахин оролдож болно.
  retryable: { type: Boolean, default: false },
  lockedAt: Date,
  finishedAt: Date,
}, opts('video_jobs'));
videoJobSchema.index({ status: 1, createdAt: 1 });
export const VideoJob = model('VideoJob', videoJobSchema);

// ---------- VideoUpload (хэсэгчлэн байршуулж буй файл) ----------
const videoUploadSchema = new Schema({
  movieId: { ...ref('Movie'), required: true },
  fileKey: { type: String, required: true },
  fileName: { type: String, required: true },
  size: { type: Number, required: true },
  chunkSize: { type: Number, required: true },
  tempPath: { type: String, required: true },
  received: { type: [Number], default: [] },
  // Завсарласан хугацааг байршуулалтын хугацаанд оруулахгүй.
  startedAt: { type: Date, default: Date.now },
  activeMs: { type: Number, default: 0 },
  updatedAt: Date,
  status: { type: String, enum: ['uploading', 'completed'], default: 'uploading' },
  jobId: ref('VideoJob'),
}, opts('video_uploads'));
videoUploadSchema.index({ movieId: 1, fileKey: 1 });
videoUploadSchema.index({ updatedAt: 1 });
export const VideoUpload = model('VideoUpload', videoUploadSchema);
