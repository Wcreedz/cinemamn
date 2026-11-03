import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { Movie, PlaybackSession, User, WatchHistory } from '../models';
import { AppError, forbidden, notFound } from '../utils/errors';
import { SubscriptionService } from './subscription.service';
import { VideoConfigurationService } from './videoConfiguration.service';

interface PlaybackClaims { sub: string; mid: string; sid: string }

// /v/<токен>/<киноны id>/<HLS файл>: HLS-ийн харьцангуй замууд токенийг автоматаар өвлөнө.
const HLS_FILE = /^(master\.m3u8|\d{3,4}p\/(index\.m3u8|seg_\d{1,6}\.ts))$/;

// Шинэ файл боловсруулагдаж эсвэл бүтэлгүйтсэн ч хуучин HLS дискэнд бүтэн байгаа.
export const isPlayable = (movie: { videoStatus?: string | null; hlsPath?: string | null }) => movie.videoStatus === 'ready' || !!movie.hlsPath;

export const StreamService = {
  async grant(userId: Types.ObjectId, movieId: string, ip?: string) {
    const movie = await Movie.findById(movieId).select('+hlsPath').lean();
    if (!movie || !movie.isPublished) throw notFound('Кино олдсонгүй.');
    if (!(await SubscriptionService.hasAccess(userId))) throw new AppError(402, 'SUBSCRIPTION_REQUIRED', 'Кино үзэхийн тулд идэвхтэй эрх шаардлагатай.');
    if (!isPlayable(movie)) throw new AppError(409, 'VIDEO_NOT_READY', 'Энэ киноны видео бэлэн болоогүй байна.');
    const { playbackTokenExpiryMinutes } = await VideoConfigurationService.get();
    const expiresAt = new Date(Date.now() + playbackTokenExpiryMinutes * 60_000);
    const session = await PlaybackSession.create({ userId, movieId: movie._id, expiresAt, ipAddress: ip });
    const token = jwt.sign({ sub: String(userId), mid: String(movie._id), sid: String(session._id) }, env.PLAYBACK_TOKEN_SECRET, { audience: 'playback', expiresIn: playbackTokenExpiryMinutes * 60 });
    await Movie.updateOne({ _id: movie._id }, { $inc: { viewCount: 1 } });
    const history = await WatchHistory.findOne({ userId, movieId: movie._id }).lean();
    return {
      token,
      manifestUrl: `${env.PUBLIC_VIDEO_BASE_URL.replace(/\/$/, '')}/v/${token}/${movie._id}/master.m3u8`,
      expiresAt,
      resumeSeconds: history && !history.completed ? history.progressSeconds : 0,
    };
  },

  // Манифест болон сегмент бүрийн хүсэлт дээр ажиллана (Nginx auth_request эсвэл API delivery).
  // Хугацаа, киноны холбоос, сешн, блоклолт, идэвхтэй эрхийг бүгдийг нь дахин шалгана.
  async authorize(token: string, movieId: string, file: string) {
    if (!HLS_FILE.test(file) || !Types.ObjectId.isValid(movieId)) throw notFound();
    let claims: PlaybackClaims;
    try {
      claims = jwt.verify(token, env.PLAYBACK_TOKEN_SECRET, { audience: 'playback' }) as unknown as PlaybackClaims;
    } catch {
      throw forbidden('Тоглуулах эрхийн хугацаа дууссан байна.');
    }
    if (claims.mid !== movieId) throw forbidden('Токен энэ кинонд хүчингүй.');
    const session = await PlaybackSession.findById(claims.sid).lean();
    if (!session || session.revokedAt) throw forbidden('Тоглуулах сешн хүчингүй болсон.');
    const userId = new Types.ObjectId(claims.sub);
    const [user, movie] = await Promise.all([User.findById(userId).lean(), Movie.findById(movieId).lean()]);
    if (!user || user.status !== 'active') throw forbidden('Бүртгэл идэвхгүй байна.');
    if (!movie?.isPublished) throw forbidden('Кино нийтлэгдээгүй байна.');
    if (!(await SubscriptionService.hasAccess(userId))) throw forbidden('Идэвхтэй эрх алга байна.');
    return { movieId, file };
  },

  parseOriginalUri(uri: string) {
    const m = /^\/v\/([^/]+)\/([a-f0-9]{24})\/([^?#]+)/i.exec(uri);
    if (!m) throw notFound();
    return { token: m[1], movieId: m[2], file: m[3] };
  },
};
