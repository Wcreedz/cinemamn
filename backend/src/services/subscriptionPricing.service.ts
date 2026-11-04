import { badRequest, unavailable } from '../utils/errors';
import { SettingsService } from './settings.service';

const QPAY_FEE_PERCENT = 1;

// QPay-ийн шимтгэлийг хэрэглэгчээс нэмж авна: 10,000₮ -> 100₮. Төгрөг бутархайгүй тул дээш тоймлоно.
export const qpayFee = (price: number) => Math.ceil((price * QPAY_FEE_PERCENT) / 100);

export const SubscriptionPricingService = {
  async publicPlans() {
    const { value, version } = await SettingsService.getEntry('subscription');
    return {
      enabled: value.enabled, paymentRequired: value.paymentRequired, currency: value.currency, version,
      plans: value.plans.filter((p) => p.enabled).map((p) => ({ ...p, currency: value.currency, fee: qpayFee(p.price), total: p.price + qpayFee(p.price) })),
    };
  },

  // Нэхэмжлэх үүсгэхэд үргэлж баазаас шууд уншина: кэшийн хуучин үнэ хэрэглэгдэхгүй.
  async quote(planCode: string) {
    const { value, version } = await SettingsService.getEntry('subscription', { fresh: true });
    if (!value.enabled) throw unavailable('SUBSCRIPTION_DISABLED', 'Эрх худалдан авах боломж одоогоор хаалттай байна.');
    const plan = value.plans.find((p) => p.code === planCode && p.enabled);
    if (!plan) throw badRequest('Сонгосон багц олдсонгүй.');
    const fee = qpayFee(plan.price);
    return { planCode: plan.code, planName: plan.name, amount: plan.price + fee, fee, durationDays: plan.durationDays, currency: value.currency, pricingVersion: version, expiryMinutes: value.paymentExpiryMinutes };
  },
};
