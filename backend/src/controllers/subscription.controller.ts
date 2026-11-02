import type { Request, Response } from 'express';
import { ISubscription, Subscription } from '../models';
import { SettingsService } from '../services/settings.service';
import { SubscriptionPricingService } from '../services/subscriptionPricing.service';
import { SubscriptionService } from '../services/subscription.service';

export async function plans(_req: Request, res: Response) {
  res.json(await SubscriptionPricingService.publicPlans());
}
export async function mine(req: Request, res: Response) {
  const [{ paymentRequired }, st] = await Promise.all([SettingsService.get('subscription'), SubscriptionService.status(req.user!._id)]);
  res.json({ hasAccess: !paymentRequired || !!st.current, paymentRequired, expiresAt: st.expiresAt, current: st.current ? SubscriptionService.view(st.current) : null });
}
export async function history(req: Request, res: Response) {
  const items = await Subscription.find({ userId: req.user!._id }).sort({ createdAt: -1 }).limit(100).lean<ISubscription[]>();
  res.json({ items: items.map(SubscriptionService.view) });
}
