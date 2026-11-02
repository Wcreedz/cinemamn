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
import { PasswordInput } from '@/components/ui/password-input';
import { RememberMe } from '@/components/ui/remember-me';
import { useRememberedLogin } from '@/hooks/use-remembered-login';

function LoginForm() {
  const router = useRouter();
  const nextParam = useSearchParams().get('next');
  const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  const { setUser } = useApp();
  const { login: phone, setLogin: setPhone, remember, setRemember, saveLogin } = useRememberedLogin('mf_login_phone');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/api/auth/login', { body: { phone, password } });
      saveLogin();
      setUser(r.user);
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div><Label htmlFor="phone">Утасны дугаар</Label><Input id="phone" inputMode="tel" autoComplete="tel" required pattern="[+0-9 ()\-]+" title="Утасны дугаараа оруулна уу" placeholder="9911 2233" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><Label htmlFor="password">Нууц үг</Label><PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <RememberMe checked={remember} onChange={setRemember} />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Нэвтэрч байна…' : 'Нэвтрэх'}</Button>
      <p className="text-sm text-muted-foreground">Бүртгэлгүй юу? <Link href="/register" className="text-primary hover:underline">Бүртгүүлэх</Link></p>
      <p className="text-sm"><Link href="/forgot-password" className="text-muted-foreground hover:underline">Нууц үг солих</Link></p>
    </form>
  );
}
export default function LoginPage() {
  return <AuthShell title="Нэвтрэх"><Suspense><LoginForm /></Suspense></AuthShell>;
}
