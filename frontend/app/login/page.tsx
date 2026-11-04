'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PublicUser } from '@mongolflix/shared';
import { AuthShell } from '@/components/auth-shell';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { authHref, safeNext } from '@/lib/auth-entry';
import { PasswordInput } from '@/components/ui/password-input';
import { PinPad } from '@/components/ui/pin-pad';
import { RememberMe } from '@/components/ui/remember-me';
import { useRememberedLogin } from '@/hooks/use-remembered-login';

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { setUser } = useApp();
  const { login: phone, setLogin: setPhone, remember, setRemember, saveLogin } = useRememberedLogin('mf_login_phone');
  const [password, setPassword] = useState('');
  // 4 оронтой дүрмээс өмнө бүртгүүлсэн хэрэглэгч хуучин нууц үгээрээ нэвтэрнэ.
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = async (secret: string) => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/api/auth/login', { body: { phone, password: secret } });
      saveLogin();
      setUser(r.user);
      router.push(next ?? '/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      if (!legacy) setPassword('');
    }
  };
  const switchMode = () => { setLegacy(!legacy); setPassword(''); setError(null); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void signIn(password); }} className="space-y-4">
      <div><Label htmlFor="phone">Утасны дугаар</Label><Input id="phone" inputMode="tel" autoComplete="tel" required pattern="[+0-9 ()\-]+" title="Утасны дугаараа оруулна уу" placeholder="9911 2233" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      {legacy
        ? <div><Label htmlFor="password">Нууц үг</Label><PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        : <PinPad id="password" label="Нууц үг" autoComplete="current-password" disabled={busy} value={password} onValue={setPassword} onComplete={(pin) => { if (phone.trim()) void signIn(pin); }} />}
      <button type="button" onClick={switchMode} className="block w-full cursor-pointer text-center text-sm text-muted-foreground hover:underline">{legacy ? '4 оронтой нууц үгээр нэвтрэх' : 'Хуучин нууц үгээр нэвтрэх'}</button>
      <RememberMe checked={remember} onChange={setRemember} />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Нэвтэрч байна…' : 'Нэвтрэх'}</Button>
      <p className="text-sm text-muted-foreground">Бүртгэлгүй юу? <Link href={authHref('/register', next)} className="text-primary hover:underline">Бүртгүүлэх</Link></p>
      <p className="text-sm"><Link href="/forgot-password" className="text-muted-foreground hover:underline">Нууц үг солих</Link></p>
    </form>
  );
}
export default function LoginPage() {
  return <AuthShell title="Нэвтрэх"><Suspense><LoginForm /></Suspense></AuthShell>;
}
