'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicSettings, PublicUser, SubscriptionMe } from '@mongolflix/shared';
import { api } from '@/lib/api';

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

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [access, setAccess] = useState<SubscriptionMe | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<{ user: PublicUser }>('/api/auth/me').catch(async () => {
        // /api/auth/ зам автомат refresh хийдэггүй тул энд нэг удаа оролдоно.
        return api<{ user: PublicUser }>('/api/auth/refresh', { method: 'POST' });
      });
      setUser(me.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    api<PublicSettings>('/api/settings/public').then(setSettings).catch(() => setSettings(null));
  }, [refreshUser]);

  useEffect(() => {
    if (!user) { setAccess(null); return; }
    api<SubscriptionMe>('/api/subscriptions/me').then(setAccess).catch(() => setAccess(null));
  }, [user]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, settings, access, refreshUser, setUser, logout }), [user, loading, settings, access, refreshUser, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp нь Providers дотор байх ёстой');
  return v;
}
