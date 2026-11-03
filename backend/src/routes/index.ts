import express, { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';
import * as admin from '../controllers/admin.controller';
import * as auth from '../controllers/auth.controller';
import * as movies from '../controllers/movie.controller';
import * as payments from '../controllers/payment.controller';
import * as settings from '../controllers/settings.controller';
import * as stream from '../controllers/stream.controller';
import * as subs from '../controllers/subscription.controller';
import { optionalAuth, requireAdmin, requireAuth, requireSuperadmin } from '../middleware/auth';
import { CHUNK_BYTES } from '../services/videoUpload.service';
import { authLimiter } from '../middleware/security';

export const api = Router();

api.get('/health', (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'db_down' });
});

// Нэвтрэлт
api.post('/auth/register', authLimiter, auth.register);
api.post('/auth/login', authLimiter, auth.login);
api.post('/auth/reset-password', authLimiter, auth.resetPassword);
api.post('/auth/admin/login', authLimiter, auth.adminLogin);
api.post('/auth/refresh', authLimiter, auth.refresh);
api.post('/auth/logout', optionalAuth, auth.logout);
api.get('/auth/session', auth.session);
api.get('/auth/me', requireAuth, auth.me);
api.patch('/auth/me', requireAuth, auth.updateProfile);
api.post('/auth/change-password', authLimiter, requireAuth, auth.changePassword);

// Нийтийн тохиргоо
api.get('/settings/public', settings.publicSettings);

// Кино
api.get('/movies', movies.listMovies);
api.get('/movies/featured', movies.featured);
api.get('/movies/new', movies.newest);
api.get('/movies/popular', movies.popular);
api.get('/movies/:slug', movies.bySlug);
api.get('/categories', movies.categories);
api.get('/search', movies.search);

// Эрх
api.get('/subscriptions/plans', subs.plans);
api.get('/subscriptions/me', requireAuth, subs.mine);
api.get('/subscriptions/history', requireAuth, subs.history);

// Төлбөр. Callback дээр нэвтрэлт байхгүй; зөвхөн QPay-с шууд шалгасан үр дүнд итгэнэ.
api.post('/qpayGargaya', requireAuth, payments.create);
api.all('/qpaycallback/:baiguullagiinId/:zakhialgiinDugaar', payments.callback);
api.get('/payments/history', requireAuth, payments.history);
api.get('/payments/:id', requireAuth, payments.byId);
api.post('/payments/:id/check', requireAuth, payments.check);
if (!env.isProd) api.post('/payments/:id/dev-simulate', requireAuth, payments.devSimulate);

// Тоглуулалт
api.post('/stream/:movieId/token', requireAuth, stream.issueToken);
api.get('/stream/:movieId/manifest', requireAuth, stream.issueToken);
api.get('/watch-history', requireAuth, stream.watchHistory);
api.put('/watch-history/:movieId', requireAuth, stream.saveProgress);

// Админ: энэ мөрөөс доошхи бүх зам backend дээр эрх шалгана.
const a = Router();
a.use(requireAdmin);
a.get('/dashboard', admin.dashboard);
a.get('/users', admin.listUsers);
a.get('/users/:id', admin.getUser);
a.patch('/users/:id/status', admin.setUserStatus);
a.patch('/users/:id/password', admin.setUserPassword);
a.get('/admins', requireSuperadmin, admin.listAdmins);
a.post('/admins', requireSuperadmin, admin.createAdmin);
a.patch('/admins/:id/role', requireSuperadmin, admin.setAdminRole);
a.get('/movies', admin.listMovies);
a.post('/movies', admin.createMovie);
a.get('/movies/:id', admin.getMovie);
a.put('/movies/:id', admin.updateMovie);
a.delete('/movies/:id', admin.deleteMovie);
a.post('/movies/:id/upload/start', admin.startVideoUpload);
a.put('/movies/:id/upload/:uploadId/chunks/:index', express.raw({ type: 'application/octet-stream', limit: CHUNK_BYTES }), admin.uploadVideoChunk);
a.post('/movies/:id/upload/:uploadId/complete', admin.completeVideoUpload);
a.post('/movies/:id/video/retry', admin.retryVideo);
a.get('/video-tools', admin.videoTools);
a.post('/movies/:id/image', admin.uploadImage);
a.get('/video-jobs', admin.videoJobs);
a.get('/categories', admin.listCategories);
a.post('/categories', admin.createCategory);
a.put('/categories/:id', admin.updateCategory);
a.delete('/categories/:id', admin.deleteCategory);
a.post('/categories/:id/image', admin.uploadCategoryImage);
a.post('/banners/image', admin.uploadBannerImage);
a.get('/payments', admin.listPayments);
a.post('/payments/:id/verify', admin.verifyPayment);
a.post('/payments/:id/refund', admin.refundPayment);
a.get('/subscriptions', admin.listSubscriptions);
a.post('/subscriptions/:userId/extend', admin.extendSubscription);
a.get('/logs', admin.listLogs);
a.get('/settings', settings.getAll);
a.put('/settings', settings.updateAny);
a.put('/settings/general', settings.updateSection('general'));
a.put('/settings/subscription', settings.updateSection('subscription'));
a.put('/settings/video', settings.updateSection('video'));
a.put('/settings/security', settings.updateSection('security'));
a.put('/settings/homepage', settings.updateSection('homepage'));
a.get('/settings/history', settings.history);
api.use('/admin', a);
