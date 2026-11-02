import type { Request } from 'express';
import { Types } from 'mongoose';
import { AdminLog } from '../models';
import { clientIp } from '../utils/http';

export async function logAdmin(req: Request, action: string, target: { type?: string; id?: Types.ObjectId | string } = {}, metadata?: unknown) {
  await AdminLog.create({
    adminId: req.user!._id, action, targetType: target.type,
    targetId: target.id ? new Types.ObjectId(target.id) : undefined, metadata, ipAddress: clientIp(req),
  });
}
