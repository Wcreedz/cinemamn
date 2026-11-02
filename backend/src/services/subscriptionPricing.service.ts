import { badRequest, unavailable } from '../utils/errors';
import { SettingsService } from './settings.service';

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
    return { planCode: plan.code, planName: plan.name, amount: plan.price, durationDays: plan.durationDays, currency: value.currency, pricingVersion: version, expiryMinutes: value.paymentExpiryMinutes };
  },
};
