import type { ApiError } from '@mongolflix/shared';

// Вэб ба API тусдаа хост дээр байвал хөтөч API руу шууд хандана. Ингэснээр прокси дамжихгүй:
// жинхэнэ IP хадгалагдаж, том файлын хэмжээний хязгаарт орохгүй. Хоосон бол ижил origin.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public code: string, public details?: unknown) {
    super(message);
  }
}

interface Options { method?: string; body?: unknown; form?: FormData; raw?: Blob; retry?: boolean }

let refreshing: Promise<boolean> | null = null;
const refresh = () => (refreshing ??= fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
  .then((r) => r.ok).catch(() => false).finally(() => { refreshing = null; }));

// Access cookie дууссан бол refresh хийж хүсэлтийг нэг удаа давтана.
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.raw ? { 'Content-Type': 'application/octet-stream' } : opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.raw ?? opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    // Хөтчийн "Failed to fetch" нь хэрэглэгчид юу ч хэлэхгүй.
  }).catch(() => { throw new ApiClientError('Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.', 0, 'NETWORK'); });
  if (res.status === 401 && opts.retry !== false && !path.startsWith('/api/auth/')) {
    if (await refresh()) return api<T>(path, { ...opts, retry: false });
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* JSON биш хариу */ }
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    // Зарим тохиргооны тест { ok, message } хэлбэрээр алдаа буцаадаг.
    const message = err?.message ?? (data as { message?: string } | null)?.message ?? (res.status === 413 ? 'Файл хэт том байна.' : 'Сервертэй холбогдоход алдаа гарлаа.');
    throw new ApiClientError(message, res.status, err?.code ?? 'ERROR', err?.details ?? data);
  }
  return data as T;
}
