'use client';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicSettings, PublicUser, SubscriptionMe } from '@mongolflix/shared';
import { api, isAdminPath, refreshSession, setSiteActsAsAdmin } from '@/lib/api';
import { markHasAccount } from '@/lib/auth-entry';

interface AppState {
  user: PublicUser | null;
  loading: boolean;
  settings: PublicSettings | null;
  access: SubscriptionMe | null;
  refreshUser: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
  logout: () => Promise<void>;
}
const Ctx = createContext<AppState | null>(null);

type Area = 'admin' | 'site';

// Админ хэсэгт зөвхөн админ сесс. Сайт дээр хэрэглэгч түрүүлнэ, байхгүй бол админ сайтаа өөрийн нэрээр үзнэ.
// stale: энэ хооронд хэрэглэгч нэвтэрсэн бол хуучин хариу шинэ сессийг дарж бичихгүй.
async function resolveSession(area: Area, stale: () => boolean) {
  const { customer, admin } = await api<{ customer: boolean; admin: boolean }>('/api/auth/session');
  const candidates = area === 'admin' ? [admin && 'admin'] : [customer && 'customer', admin && 'admin'];
  for (const scope of candidates) {
    if (!scope) continue;
    if (stale()) return null;
    setSiteActsAsAdmin(scope === 'admin');
    try {
      return (await api<{ user: PublicUser }>('/api/auth/me')).user;
    } catch {
      // /api/auth/ зам автомат refresh хийдэггүй тул энд нэг удаа оролдоно.
      if (await refreshSession()) {
        const renewed = await api<{ user: PublicUser }>('/api/auth/me').catch(() => null);
        if (renewed) return renewed.user;
      }
    }
  }
  if (!stale()) setSiteActsAsAdmin(false);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const area: Area = isAdminPath(usePathname()) ? 'admin' : 'site';
  const [session, setSession] = useState<{ area: Area; user: PublicUser | null } | null>(null);
  const latest = useRef(0);
  // Сайт, админ хэсгийн хооронд шилжихэд нөгөө талын хэрэглэгчийг нэг ч агшин харуулахгүй.
  const current = session?.area === area ? session : null;
  const user = current?.user ?? null;
  const loading = !current;
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [access, setAccess] = useState<SubscriptionMe | null>(null);

  const setUser = useCallback((next: PublicUser | null) => {
    latest.current++;
    setSession({ area, user: next });
  }, [area]);

  const refreshUser = useCallback(async () => {
    const request = ++latest.current;
    const next = await resolveSession(area, () => request !== latest.current).catch(() => null);
    if (request === latest.current) setSession({ area, user: next });
  }, [area]);

  useEffect(() => { void refreshUser(); }, [refreshUser]);
  useEffect(() => { api<PublicSettings>('/api/settings/public').then(setSettings).catch(() => setSettings(null)); }, []);

  // Бүртгүүлсэн, нэвтэрсэн, сесс нь хүчинтэй хэвээр байгаа бүх тохиолдол энд нэг дор тэмдэглэгдэнэ.
  useEffect(() => { if (user) markHasAccount(); }, [user]);

  useEffect(() => {
    if (!user) { setAccess(null); return; }
    api<SubscriptionMe>('/api/subscriptions/me').then(setAccess).catch(() => setAccess(null));
  }, [user]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    // Нөгөө сесс хэвээр байж болно: дэлгэц бодит байдлыг харуулна.
    await refreshUser();
  }, [refreshUser]);

  const value = useMemo(() => ({ user, loading, settings, access, refreshUser, setUser, logout }), [user, loading, settings, access, refreshUser, setUser, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp нь Providers дотор байх ёстой');
  return v;
}
