const HAS_ACCOUNT_KEY = 'mf_has_account';

// Open redirect-ээс сэргийлж зөвхөн сайтын дотоод замыг зөвшөөрнө.
export function safeNext(next: string | null): string | null {
  return next?.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function authHref(page: '/login' | '/register', next?: string | null): string {
  return next ? `${page}?next=${encodeURIComponent(next)}` : page;
}

export function markHasAccount() {
  try { localStorage.setItem(HAS_ACCOUNT_KEY, '1'); } catch { /* localStorage хаалттай */ }
}

// Энэ хөтчөөр анх орж буй хүнд бүртгэл, өмнө нь нэвтэрсэн хүнд нэвтрэх хуудас.
// localStorage хаалттай бол анх орсон эсэхийг мэдэхгүй тул нэвтрэх хуудас: бүртгэлтэй хүн бүрт бүртгэл харуулахгүй.
export function authEntry(next?: string | null): string {
  try {
    return authHref(localStorage.getItem(HAS_ACCOUNT_KEY) ? '/login' : '/register', next);
  } catch {
    return authHref('/login', next);
  }
}
