import type { ApiError } from '@mongolflix/shared';

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public code: string, public details?: unknown) {
    super(message);
  }
}

interface Options { method?: string; body?: unknown; form?: FormData; retry?: boolean }

let refreshing: Promise<boolean> | null = null;
const refresh = () => (refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
  .then((r) => r.ok).catch(() => false).finally(() => { refreshing = null; }));

// Access cookie дууссан бол refresh хийж хүсэлтийг нэг удаа давтана.
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && opts.retry !== false && !path.startsWith('/api/auth/')) {
    if (await refresh()) return api<T>(path, { ...opts, retry: false });
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* JSON биш хариу */ }
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    // Зарим тохиргооны тест { ok, message } хэлбэрээр алдаа буцаадаг.
    const message = err?.message ?? (data as { message?: string } | null)?.message ?? 'Сервертэй холбогдоход алдаа гарлаа.';
    throw new ApiClientError(message, res.status, err?.code ?? 'ERROR', err?.details ?? data);
  }
  return data as T;
}
