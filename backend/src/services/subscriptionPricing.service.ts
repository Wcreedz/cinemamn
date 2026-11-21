import { Movie } from '../models';
import { badRequest, conflict, notFound, unavailable } from '../utils/errors';
import { SettingsService } from './settings.service';
import { isPlayable } from './playable';

const QPAY_FEE_PERCENT = 1;
// Нэг киноны эрхийн төлбөр, эрхийн planCode. Админы багцын код [A-Z0-9_] тул давхцахгүйн тулд багцын жагсаалтад оруулахгүй.
export const MOVIE_PLAN_CODE = 'MOVIE';

// QPay-ийн шимтгэлийг зөвхөн нэхэмжлэх дээр нэмж авна: 9,900₮ -> 99₮. Төгрөг бутархайгүй тул дээш тоймлоно.
export const qpayFee = (price: number) => Math.ceil((price * QPAY_FEE_PERCENT) / 100);
// Төлбөрийн шимтгэлгүй үндсэн үнэ. QPay төлөхөөс бусад газар үүнийг харуулна.
export const paymentPrice = (p: { amount: number; fee?: number }) => p.amount - (p.fee ?? 0);

export const SubscriptionPricingService = {
  async publicPlans() {
    const { value, version } = await SettingsService.getEntry('subscription');
    return {
      enabled: value.enabled, paymentRequired: value.paymentRequired, currency: value.currency, version,
      plans: value.plans.filter((p) => p.enabled).map((p) => ({ ...p, currency: value.currency })),
    };
  },

  // Нэхэмжлэх үүсгэхэд үргэлж баазаас шууд уншина: кэшийн хуучин үнэ хэрэглэгдэхгүй.
  async quote(planCode: string) {
    const { value, version } = await SettingsService.getEntry('subscription', { fresh: true });
    if (!value.enabled) throw unavailable('SUBSCRIPTION_DISABLED', 'Эрх худалдан авах боломж одоогоор хаалттай байна.');
    const plan = value.plans.find((p) => p.code === planCode && p.enabled);
    if (!plan) throw badRequest('Сонгосон багц олдсонгүй.');
    const fee = qpayFee(plan.price);
    return { planCode: plan.code, planName: plan.name, amount: plan.price + fee, fee, durationDays: plan.durationDays, currency: value.currency, pricingVersion: version, expiryMinutes: value.paymentExpiryMinutes, movieId: undefined };
  },

  // Зөвхөн нэг киноны эрх. Үнэ, хугацааг киноны бичлэгээс шууд уншина: хүсэлтийн биед итгэхгүй.
  async quoteMovie(movieId: string) {
    const movie = await Movie.findOne({ _id: movieId, isPublished: true }).select('+hlsPath title rentalPrice rentalDays videoStatus').lean();
    if (!movie) throw notFound('Кино олдсонгүй.');
    if (!movie.rentalPrice) throw badRequest('Энэ киног тусад нь худалдаж авах боломжгүй. Бүх киноны эрх авна уу.');
    // Видео бэлэн болоогүй киног төлүүлбэл үзэж чадахгүй хугацаа нь гүйнэ.
    if (!isPlayable(movie)) throw conflict('Энэ киноны видео бэлтгэгдэж байна. Бэлэн болсны дараа худалдаж авна уу.');
    const { value, version } = await SettingsService.getEntry('subscription', { fresh: true });
    const fee = qpayFee(movie.rentalPrice);
    return {
      planCode: MOVIE_PLAN_CODE, planName: `Кино: ${movie.title}`.slice(0, 120), amount: movie.rentalPrice + fee, fee,
      durationDays: movie.rentalDays ?? 30, currency: value.currency, pricingVersion: version, expiryMinutes: value.paymentExpiryMinutes, movieId: movie._id,
    };
  },
};
