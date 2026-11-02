import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { IPayment, Payment } from '../models';
import { PaymentService } from '../services/payment.service';
import { notFound } from '../utils/errors';
import { objectId, paged, pageQuery, parse } from '../utils/http';
import { createPaymentSchema } from '../validators';
import { z } from 'zod';

export async function create(req: Request, res: Response) {
  // Биеээс зөвхөн багцын кодыг уншина: дүн, валют серверийн тохиргооноос тооцогдоно.
  const { planCode } = parse(createPaymentSchema, req.body);
  const payment = await PaymentService.create(req.user!._id, planCode);
  res.status(201).json(PaymentService.view(payment.toObject() as IPayment));
}

export async function byId(req: Request, res: Response) {
  const id = parse(objectId, req.params.id);
  const p = await Payment.findOne({ _id: id, userId: req.user!._id }).lean<IPayment>();
  if (!p) throw notFound('Төлбөр олдсонгүй.');
  res.json(PaymentService.view(p));
}

export async function check(req: Request, res: Response) {
  const id = new Types.ObjectId(parse(objectId, req.params.id));
  res.json(PaymentService.view(await PaymentService.userCheck(req.user!._id, id)));
}

export async function history(req: Request, res: Response) {
  const q = parse(pageQuery, req.query);
  const filter = { userId: req.user!._id };
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean<IPayment[]>(),
    Payment.countDocuments(filter),
  ]);
  res.json(paged(items.map(PaymentService.view), total, q.page, q.limit));
}

// QPay callback. Хүсэлтийн агуулгад итгэхгүй: зөвхөн захиалгын дугаараар олж, QPay-с шууд шалгана.
export async function callback(req: Request, res: Response) {
  const order = String(req.query.order ?? req.params.orderNumber ?? '');
  if (!/^MF[A-Z0-9]{8,40}$/.test(order)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Захиалгын дугаар буруу байна.' } });
  const payment = await Payment.findOne({ orderNumber: order }).select('_id').lean();
  if (!payment) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Захиалга олдсонгүй.' } });
  try {
    const outcome = await PaymentService.verifyFromCallback(payment._id);
    res.json({ received: true, outcome });
  } catch (err) {
    console.error(`[qpay] callback шалгалт амжилтгүй ${order}:`, (err as Error).message);
    res.status(502).json({ received: true, outcome: 'error' });
  }
}

// Зөвхөн хөгжүүлэлтэд: QPay sandbox-гүй үед төлбөрийн урсгалыг туршина. app.ts production дээр холбодоггүй.
export async function devSimulate(req: Request, res: Response) {
  if (env.isProd) throw notFound();
  const id = new Types.ObjectId(parse(objectId, req.params.id));
  const { amount } = parse(z.object({ amount: z.number().optional() }), req.body ?? {});
  const p = await Payment.findOne({ _id: id, userId: req.user!._id }).lean<IPayment>();
  if (!p) throw notFound('Төлбөр олдсонгүй.');
  if (amount !== undefined && amount !== p.amount) {
    await Payment.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'failed', failureReason: 'AMOUNT_MISMATCH' } });
  } else {
    await PaymentService.applyPaid(id, `SIMULATED-${Date.now()}`);
  }
  res.json(PaymentService.view((await Payment.findById(id).lean<IPayment>())!));
}
