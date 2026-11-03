// Open redirect-ээс сэргийлж зөвхөн сайтын дотоод замыг зөвшөөрнө.
export function safeNext(next: string | null): string | null {
  return next?.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function authHref(page: '/login' | '/register', next?: string | null): string {
  return next ? `${page}?next=${encodeURIComponent(next)}` : page;
}
