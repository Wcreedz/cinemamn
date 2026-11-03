import type { Request, Response } from 'express';
import { promises as fs } from 'fs';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AdminLog, Category, IPayment, ISubscription, Movie, Payment, Subscription, User, VideoJob, WatchHistory } from '../models';
import { logAdmin } from '../services/adminLog.service';
import { AuthService, hashPassword } from '../services/auth.service';
import { PaymentService } from '../services/payment.service';
import { SubscriptionService } from '../services/subscription.service';
import { VideoService } from '../services/video.service';
import { VideoConfigurationService } from '../services/videoConfiguration.service';
import { VideoUploadService } from '../services/videoUpload.service';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { escapeRegex, objectId, paged, pageQuery, parse, sortFrom } from '../utils/http';
import { normalizePhone } from '../utils/phone';
import { toSlug } from '../utils/slug';
import { adminCreateSchema, adminRoleSchema, categoryInput, extendSchema, movieInput, refundSchema, userPasswordSchema, userStatusSchema } from '../validators';
import { movieDetail } from './movie.controller';

const idParam = (req: Request, name = 'id') => new Types.ObjectId(parse(objectId, req.params[name]));

export async function dashboard(_req: Request, res: Response) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalUsers, activeIds, everSubscribed, totalPayments, revenue, recent, topMovies, video] = await Promise.all([
    User.countDocuments(),
    Subscription.distinct('userId', { status: 'active', startedAt: { $lte: now }, expiresAt: { $gt: now } }),
    Subscription.distinct('userId'),
    Payment.countDocuments({ status: 'paid' }),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: monthStart } } }, { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Payment.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'phone').lean(),
    Movie.find().sort({ viewCount: -1 }).limit(5).select('title slug viewCount').lean(),
    Movie.aggregate([{ $group: { _id: '$videoStatus', count: { $sum: 1 } } }]),
  ]);
  res.json({
    totalUsers, activeSubscribers: activeIds.length, expiredSubscribers: Math.max(everSubscribed.length - activeIds.length, 0), totalPayments,
    monthlyRevenue: revenue, recentPayments: recent.map((p: any) => ({ ...PaymentService.view(p), phone: p.userId?.phone })),
    topMovies: topMovies.map((m: any) => ({ id: String(m._id), title: m.title, slug: m.slug, viewCount: m.viewCount })),
    videoStatus: Object.fromEntries(video.map((v: any) => [v._id, v.count])),
  });
}

// ---------- Хэрэглэгч ----------
export async function listUsers(req: Request, res: Response) {
  const q = parse(pageQuery.extend({ q: z.string().trim().max(20).optional(), role: z.enum(['user', 'admin', 'superadmin']).optional(), status: z.enum(['active', 'blocked']).optional() }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.q) filter.phone = { $regex: escapeRegex(q.q) };
  if (q.role) filter.role = q.role;
  if (q.status) filter.status = q.status;
  const [items, total] = await Promise.all([
    User.find(filter).sort(sortFrom(q.sort, ['createdAt', 'phone', 'lastLoginAt'], '-createdAt')).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
  ]);
  res.json(paged(items.map(AuthService.view), total, q.page, q.limit));
}

export async function getUser(req: Request, res: Response) {
  const id = idParam(req);
  const user = await User.findById(id).lean();
  if (!user) throw notFound('Хэрэглэгч олдсонгүй.');
  const [subs, payments, watch] = await Promise.all([
    Subscription.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean<ISubscription[]>(),
    Payment.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean<IPayment[]>(),
    WatchHistory.find({ userId: id }).sort({ lastWatchedAt: -1 }).limit(50).populate('movieId', 'title slug').lean(),
  ]);
  const st = await SubscriptionService.status(id);
  res.json({
    user: AuthService.view(user), expiresAt: st.expiresAt, hasActive: !!st.current,
    subscriptions: subs.map(SubscriptionService.view), payments: payments.map(PaymentService.view),
    watchHistory: watch.map((w: any) => ({ title: w.movieId?.title, slug: w.movieId?.slug, progressSeconds: w.progressSeconds, durationSeconds: w.durationSeconds, completed: w.completed, lastWatchedAt: w.lastWatchedAt })),
  });
}

export async function setUserStatus(req: Request, res: Response) {
  const id = idParam(req);
  const { status } = parse(userStatusSchema, req.body);
  const target = await User.findById(id);
  if (!target) throw notFound('Хэрэглэгч олдсонгүй.');
  if (String(target._id) === String(req.user!._id)) throw badRequest('Өөрийгөө блоклох боломжгүй.');
  if (target.role !== 'user' && req.user!.role !== 'superadmin') throw forbidden('Админыг зөвхөн Superadmin блоклоно.');
  const before = target.status;
  target.status = status;
  await target.save();
  if (status === 'blocked') await AuthService.revokeUser(id);
  await logAdmin(req, 'user.status', { type: 'User', id }, { before, after: status });
  res.json(AuthService.view(target));
}

// SMS-гүй тул мартсан нууц үгийг админ шинэчилнэ. Хуучин сешнүүд хаагдана.
export async function setUserPassword(req: Request, res: Response) {
  const id = idParam(req);
  const { password } = parse(userPasswordSchema, req.body);
  const target = await User.findById(id);
  if (!target) throw notFound('Хэрэглэгч олдсонгүй.');
  if (target.role !== 'user' && req.user!.role !== 'superadmin') throw forbidden('Админы нууц үгийг зөвхөн Superadmin шинэчилнэ.');
  target.passwordHash = await hashPassword(password);
  target.failedLoginAttempts = 0;
  target.lockUntil = undefined;
  await target.save();
  await AuthService.revokeUser(id);
  await logAdmin(req, 'user.password_reset', { type: 'User', id });
  res.json({ ok: true });
}

// ---------- Админ удирдлага (зөвхөн Superadmin) ----------
export async function listAdmins(_req: Request, res: Response) {
  const items = await User.find({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 }).lean();
  res.json({ items: items.map(AuthService.view) });
}

export async function createAdmin(req: Request, res: Response) {
  const b = parse(adminCreateSchema, req.body);
  const phone = normalizePhone(b.phone);
  let user = await User.findOne({ phone });
  if (b.role === 'superadmin') await AuthService.assertSuperadminSlot(user?._id);
  if (user) {
    user.role = b.role;
    user.email = b.email;
    await user.save();
  } else {
    if (!b.password) throw badRequest('Шинэ админд нууц үг оруулна уу.');
    user = await User.create({ phone, email: b.email, passwordHash: await hashPassword(b.password), name: b.name, role: b.role });
  }
  await logAdmin(req, 'admin.create', { type: 'User', id: user._id }, { role: b.role, phone });
  res.status(201).json(AuthService.view(user));
}

export async function setAdminRole(req: Request, res: Response) {
  const id = idParam(req);
  const { role } = parse(adminRoleSchema, req.body);
  const target = await User.findById(id);
  if (!target) throw notFound('Хэрэглэгч олдсонгүй.');
  if (target.role === 'superadmin' && role !== 'superadmin' && (await User.countDocuments({ role: 'superadmin', status: 'active' })) <= 1) {
    throw conflict('Сүүлчийн Superadmin-ы эрхийг хасах боломжгүй.');
  }
  if (role === 'superadmin') await AuthService.assertSuperadminSlot(id);
  // Админ зөвхөн имэйлээр нэвтэрдэг тул имэйлгүй хүнийг дэвшүүлбэл нэвтэрч чадахгүй болно.
  if (role !== 'user' && !target.email) throw badRequest('Энэ хэрэглэгчид имэйл алга. "Админ нэмэх" хэсгээс имэйлтэй нь нэмнэ үү.');
  const before = target.role;
  target.role = role;
  await target.save();
  await logAdmin(req, 'admin.role', { type: 'User', id }, { before, after: role });
  res.json(AuthService.view(target));
}

// ---------- Кино ----------
const adminMovie = (m: any) => ({ ...movieDetail(m), isPublished: m.isPublished, videoError: m.videoError, videoProgress: m.videoProgress, createdAt: m.createdAt, updatedAt: m.updatedAt });

export async function listMovies(req: Request, res: Response) {
  const q = parse(pageQuery.extend({ q: z.string().trim().max(100).optional(), published: z.enum(['true', 'false']).optional() }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.q) filter.title = { $regex: escapeRegex(q.q), $options: 'i' };
  if (q.published) filter.isPublished = q.published === 'true';
  const [items, total] = await Promise.all([
    Movie.find(filter).populate('genres').sort(sortFrom(q.sort, ['createdAt', 'title', 'viewCount'], '-createdAt')).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Movie.countDocuments(filter),
  ]);
  res.json(paged(items.map(adminMovie), total, q.page, q.limit));
}

export async function getMovie(req: Request, res: Response) {
  const id = idParam(req);
  const m = await Movie.findById(id).populate('genres').lean();
  if (!m) throw notFound('Кино олдсонгүй.');
  const videoRetryable = !!(await VideoJob.exists({ movieId: id, status: 'failed', retryable: true }));
  res.json({ ...adminMovie(m), videoRetryable });
}

export async function videoTools(_req: Request, res: Response) {
  await VideoService.checkTools();
  res.json({ ok: true });
}

export async function retryVideo(req: Request, res: Response) {
  const id = idParam(req);
  const job = await VideoService.retry(String(id));
  await logAdmin(req, 'movie.video_retry', { type: 'Movie', id }, { jobId: String(job._id) });
  res.status(202).json({ videoStatus: 'queued' });
}

// Давхцлыг unique index шийднэ: урьдчилж шалгавал зэрэг нэмэхэд давхцаж болно.
async function createWithUniqueSlug(input: z.infer<typeof movieInput>) {
  if (input.slug) return Movie.create(input);
  const base = toSlug(input.title);
  for (let n = 1; ; n++) {
    try {
      return await Movie.create({ ...input, slug: n === 1 ? base : `${base}-${n}` });
    } catch (err) {
      const e = err as { code?: number; keyPattern?: Record<string, unknown> };
      if (e.code !== 11000 || !e.keyPattern?.slug) throw err;
    }
  }
}

export async function createMovie(req: Request, res: Response) {
  const m = await createWithUniqueSlug(parse(movieInput, req.body));
  await logAdmin(req, 'movie.create', { type: 'Movie', id: m._id }, { title: m.title });
  res.status(201).json(adminMovie((await Movie.findById(m._id).populate('genres').lean())!));
}

export async function updateMovie(req: Request, res: Response) {
  const id = idParam(req);
  const b = parse(movieInput, req.body);
  const m = await Movie.findByIdAndUpdate(id, { $set: b }, { new: true, runValidators: true }).populate('genres').lean();
  if (!m) throw notFound('Кино олдсонгүй.');
  await logAdmin(req, 'movie.update', { type: 'Movie', id }, { title: m.title, isPublished: m.isPublished, featured: m.featured });
  res.json(adminMovie(m));
}

export async function deleteMovie(req: Request, res: Response) {
  const id = idParam(req);
  const m = await Movie.findByIdAndDelete(id).select('+videoSource').lean();
  if (!m) throw notFound('Кино олдсонгүй.');
  const { storageRoot } = await VideoConfigurationService.get();
  const dirs = VideoConfigurationService.dirs(storageRoot);
  await fs.rm(path.join(dirs.hls, String(id)), { recursive: true, force: true });
  if (m.videoSource) await fs.rm(m.videoSource, { force: true });
  await VideoUploadService.discardForMovie(String(id));
  await WatchHistory.deleteMany({ movieId: id });
  await logAdmin(req, 'movie.delete', { type: 'Movie', id }, { title: m.title });
  res.json({ ok: true });
}

const uploadStartSchema = z.object({ fileName: z.string().trim().min(1).max(255), size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), lastModified: z.number().int() });
const uploadChunkParams = z.object({ uploadId: objectId, index: z.coerce.number().int().min(0) });

export async function startVideoUpload(req: Request, res: Response) {
  res.json(await VideoUploadService.start(String(idParam(req)), parse(uploadStartSchema, req.body)));
}

export async function uploadVideoChunk(req: Request, res: Response) {
  const { uploadId, index } = parse(uploadChunkParams, req.params);
  await VideoUploadService.writeChunk(String(idParam(req)), uploadId, index, req.body);
  res.json({ ok: true });
}

export async function completeVideoUpload(req: Request, res: Response) {
  const id = idParam(req);
  const { uploadId } = parse(uploadChunkParams.pick({ uploadId: true }), req.params);
  // Хүнд FFmpeg ажлыг HTTP хүсэлтэд биш, тусдаа worker-т өгнө.
  const { jobId, size } = await VideoUploadService.complete(String(id), uploadId);
  await logAdmin(req, 'movie.video_upload', { type: 'Movie', id }, { jobId, size });
  res.status(202).json({ jobId, videoStatus: 'queued' });
}

// Гарчгаас биш файлын эхний байтаас зургийн төрлийг тодорхойлно.
function imageExt(buf: Buffer) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

export async function uploadImage(req: Request, res: Response) {
  const id = idParam(req);
  const { kind } = parse(z.object({ kind: z.enum(['poster', 'backdrop']) }), req.query);
  if (!(await Movie.exists({ _id: id }))) throw notFound('Кино олдсонгүй.');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('image');
  await new Promise<void>((resolve, reject) => upload(req, res, (err) => (err ? reject(err) : resolve())));
  if (!req.file) throw badRequest('Зураг сонгоно уу.');
  const ext = imageExt(req.file.buffer);
  if (!ext) throw badRequest('Зөвхөн JPG, PNG, WEBP зураг байршуулна.');
  const { storageRoot } = await VideoConfigurationService.get();
  const dirs = VideoConfigurationService.dirs(storageRoot);
  const folder = kind === 'poster' ? 'posters' : 'backdrops';
  await fs.mkdir(dirs[folder], { recursive: true });
  const name = `${id}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  await fs.writeFile(path.join(dirs[folder], name), req.file.buffer);
  // Харьцангуй зам: домэйн солигдох, HTTPS руу шилжихэд зураг эвдрэхгүй.
  const url = `/media/${folder}/${name}`;
  await Movie.updateOne({ _id: id }, { $set: { [kind]: url } });
  await logAdmin(req, `movie.${kind}_upload`, { type: 'Movie', id });
  res.json({ url });
}

// ---------- Ангилал ----------
export async function listCategories(_req: Request, res: Response) {
  res.json({ items: (await Category.find().sort({ sortOrder: 1 }).lean()).map((c: any) => ({ id: String(c._id), name: c.name, slug: c.slug, description: c.description, image: c.image, sortOrder: c.sortOrder, isActive: c.isActive })) });
}
export async function createCategory(req: Request, res: Response) {
  const c = await Category.create(parse(categoryInput, req.body));
  await logAdmin(req, 'category.create', { type: 'Category', id: c._id }, { name: c.name });
  res.status(201).json({ id: String(c._id) });
}
export async function updateCategory(req: Request, res: Response) {
  const id = idParam(req);
  const c = await Category.findByIdAndUpdate(id, { $set: parse(categoryInput, req.body) }, { new: true, runValidators: true });
  if (!c) throw notFound('Ангилал олдсонгүй.');
  await logAdmin(req, 'category.update', { type: 'Category', id }, { name: c.name });
  res.json({ id: String(c._id) });
}
export async function deleteCategory(req: Request, res: Response) {
  const id = idParam(req);
  if (await Movie.exists({ genres: id })) throw conflict('Энэ ангилалд кино холбогдсон байна.');
  await Category.deleteOne({ _id: id });
  await logAdmin(req, 'category.delete', { type: 'Category', id });
  res.json({ ok: true });
}

// ---------- Төлбөр ----------
const adminPayment = (p: any) => ({
  ...PaymentService.view(p), phone: p.userId?.phone, userId: String(p.userId?._id ?? p.userId), invoiceId: p.invoiceId, paymentId: p.paymentId,
  pricingVersion: p.pricingVersion, verifiedAt: p.verifiedAt, verificationNote: p.verificationNote, refundNote: p.refundNote,
});

export async function listPayments(req: Request, res: Response) {
  const q = parse(pageQuery.extend({
    q: z.string().trim().max(60).optional(),
    status: z.enum(['pending', 'paid', 'failed', 'expired', 'refunded']).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  }), req.query);
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    const users = await User.find({ phone: rx }).select('_id').limit(50).lean();
    filter.$or = [{ orderNumber: rx }, { invoiceId: rx }, { paymentId: rx }, { userId: { $in: users.map((u) => u._id) } }];
  }
  const [items, total] = await Promise.all([
    Payment.find(filter).sort(sortFrom(q.sort, ['createdAt', 'amount', 'paidAt'], '-createdAt')).skip((q.page - 1) * q.limit).limit(q.limit).populate('userId', 'phone').lean(),
    Payment.countDocuments(filter),
  ]);
  res.json(paged(items.map(adminPayment), total, q.page, q.limit));
}

export async function verifyPayment(req: Request, res: Response) {
  const id = idParam(req);
  const outcome = await PaymentService.verify(id);
  await logAdmin(req, 'payment.verify', { type: 'Payment', id }, { outcome });
  res.json({ outcome, payment: adminPayment((await Payment.findById(id).populate('userId', 'phone').lean())!) });
}

export async function refundPayment(req: Request, res: Response) {
  const id = idParam(req);
  const { note } = parse(refundSchema, req.body);
  if (req.user!.role !== 'superadmin') throw forbidden('Буцаалтыг зөвхөн Superadmin бүртгэнэ.');
  await PaymentService.markRefunded(id, req.user!._id, note);
  await logAdmin(req, 'payment.refund', { type: 'Payment', id }, { note });
  res.json({ ok: true });
}

// ---------- Эрх ----------
export async function listSubscriptions(req: Request, res: Response) {
  const q = parse(pageQuery.extend({ status: z.enum(['pending', 'active', 'expired', 'cancelled']).optional() }), req.query);
  const filter = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    Subscription.find(filter).sort(sortFrom(q.sort, ['createdAt', 'expiresAt'], '-createdAt')).skip((q.page - 1) * q.limit).limit(q.limit).populate('userId', 'phone').lean(),
    Subscription.countDocuments(filter),
  ]);
  res.json(paged(items.map((s: any) => ({ ...SubscriptionService.view(s), phone: s.userId?.phone, userId: String(s.userId?._id ?? s.userId), note: s.note })), total, q.page, q.limit));
}

export async function extendSubscription(req: Request, res: Response) {
  const userId = idParam(req, 'userId');
  const { days, note } = parse(extendSchema, req.body);
  const sub = await SubscriptionService.grantManually(userId, days, req.user!._id, note);
  await logAdmin(req, 'subscription.extend', { type: 'User', id: userId }, { days, note, expiresAt: sub.expiresAt });
  res.status(201).json(SubscriptionService.view(sub.toObject() as ISubscription));
}

export async function listLogs(req: Request, res: Response) {
  const q = parse(pageQuery.extend({ action: z.string().regex(/^[\w.]+$/).optional() }), req.query);
  const filter = q.action ? { action: { $regex: `^${escapeRegex(q.action)}` } } : {};
  const [items, total] = await Promise.all([
    AdminLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('adminId', 'email phone name').lean(),
    AdminLog.countDocuments(filter),
  ]);
  res.json(paged(items, total, q.page, q.limit));
}

export async function videoJobs(_req: Request, res: Response) {
  const items = await VideoJob.find().sort({ createdAt: -1 }).limit(50).select('-sourcePath').populate('movieId', 'title').lean();
  res.json({ items });
}
