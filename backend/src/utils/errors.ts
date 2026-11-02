export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Нэвтрэх шаардлагатай.') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Энэ үйлдлийг хийх эрхгүй байна.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Олдсонгүй.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'CONFLICT', message, details);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);
