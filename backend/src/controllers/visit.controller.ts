import type { Request, Response } from 'express';
import { VisitService } from '../services/visit.service';
import { parse } from '../utils/http';
import { visitSchema } from '../validators';

export async function record(req: Request, res: Response) {
  const { visitorId } = parse(visitSchema, req.body);
  await VisitService.record(visitorId);
  res.status(204).end();
}
