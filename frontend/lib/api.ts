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

export const isAdminPath = (path: string) => /^\/admin(\/|$)/.test(path);

// Админ хэсэг админ сессээр ажиллана. Хэрэглэгчээр нэвтрээгүй бол сайт дээрх таб ч админ сессээ хэрэглэнэ.
let siteActsAsAdmin = false;
export const setSiteActsAsAdmin = (value: boolean) => { siteActsAsAdmin = value; };
const scopeHeaders = (): Record<string, string> => (siteActsAsAdmin || (typeof window !== 'undefined' && isAdminPath(window.location.pathname)) ? { 'X-Auth-Scope': 'admin' } : {});

// Refresh токен нэг удаагийн: зэрэг хоёр дуудлагыг сервер хулгай гэж үзээд сессийг хаадаг.
// Таб дотор нэг promise, табуудын хооронд түгжээ. Түгжээ хүлээсэн таб эхлээд шалгана: нөгөө таб аль хэдийн шинэчилсэн байж болно.
async function renewSession(headers: Record<string, string>) {
  const me = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', headers });
  if (me.ok) return true;
  return (await fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include', headers })).ok;
}
let refreshing: Promise<boolean> | null = null;
export const refreshSession = () => {
  if (refreshing) return refreshing;
  const headers = scopeHeaders();
  // Web Locks нь хуучин хөтчид алга: тэнд зөвхөн таб доторх хамгаалалт үлдэнэ.
  const run = navigator.locks ? navigator.locks.request(`mf_refresh_${headers['X-Auth-Scope'] ?? 'customer'}`, () => renewSession(headers)).then((renewed) => renewed) : renewSession(headers);
  refreshing = run.catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
};

// Сесс сэргэхгүй болсон: дэлгэц "нэвтэрсэн" хэвээр үлдэж алдаа заахгүйн тул Providers сессээ дахин шалгана.
let onSessionLost: (() => void) | null = null;
export const setSessionLostHandler = (handler: (() => void) | null) => { onSessionLost = handler; };

// Access cookie дууссан бол refresh хийж хүсэлтийг нэг удаа давтана.
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: { ...scopeHeaders(), ...(opts.raw ? { 'Content-Type': 'application/octet-stream' } : opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.raw ?? opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    // Хөтчийн "Failed to fetch" нь хэрэглэгчид юу ч хэлэхгүй.
  }).catch(() => { throw new ApiClientError('Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.', 0, 'NETWORK'); });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    if (opts.retry !== false && await refreshSession()) return api<T>(path, { ...opts, retry: false });
    onSessionLost?.();
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
  // Энэ таб одоо хэрэглэгч болсон: дараагийн хүсэлтүүд админы нэрээр явахгүй.
  if (path === '/api/auth/login' || path === '/api/auth/register') siteActsAsAdmin = false;
  return data as T;
}
