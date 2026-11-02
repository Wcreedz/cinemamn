import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Хаяг олдсонгүй.' } });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Файлын хэмжээ зөвшөөрөгдсөн дээд хэмжээнээс их байна.' : 'Файл байршуулахад алдаа гарлаа.';
    return res.status(400).json({ error: { code: err.code, message } });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Хүсэлтийн формат буруу байна.' } });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Хүсэлт хэт том байна.' } });
  if (err?.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Ийм мэдээлэл аль хэдийн бүртгэгдсэн байна.' } });
  if (err?.name === 'ValidationError' || err?.name === 'CastError') return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Оруулсан мэдээлэл буруу байна.' } });
  console.error(`[error] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Системийн алдаа гарлаа. Дахин оролдоно уу.' } });
}
