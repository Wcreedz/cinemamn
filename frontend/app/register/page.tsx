'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { PublicUser } from '@mongolflix/shared';
import { AuthShell } from '@/components/auth-shell';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { authHref, safeNext } from '@/lib/auth-entry';
import { PinPad } from '@/components/ui/pin-pad';

function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { setUser } = useApp();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/api/auth/register', { body: { phone, password } });
      setUser(r.user);
      router.push(next ?? '/subscription');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div><Label htmlFor="phone">Утасны дугаар</Label><Input id="phone" inputMode="tel" autoComplete="tel" required placeholder="9911 2233" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <PinPad id="password" label="4 оронтой нууц үг сонгох" disabled={busy} value={password} onValue={setPassword} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Үүсгэж байна…' : 'Бүртгэл үүсгэх'}</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">Бүртгэлтэй юу? <Link href={authHref('/login', next)} className="text-primary hover:underline">Нэвтрэх</Link></p>
    </>
  );
}
export default function RegisterPage() {
  return <AuthShell title="Бүртгүүлэх"><Suspense><RegisterForm /></Suspense></AuthShell>;
}
