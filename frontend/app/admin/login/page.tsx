'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { PublicUser } from '@mongolflix/shared';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';

const Required = () => <span className="text-destructive" aria-hidden>*</span>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, setUser, settings } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'user') router.replace('/admin');
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/api/auth/admin/login', { body: { email, password, remember } });
      setUser(r.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fafafa] px-4 py-10 [--primary-foreground:#12162b] [--primary:#66cc77] [--ring:#16a34a]">
      <div className="w-full max-w-md rounded-xl border bg-card px-6 py-8 shadow-sm sm:px-12">
        <p className="text-center text-xl font-bold">{settings?.general.siteName ?? 'MongolFlix'}</p>
        <h1 className="mb-6 mt-3 text-center text-2xl font-bold">Нэвтрэх</h1>
        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <div>
            <Label htmlFor="email">Имэйл хаяг<Required /></Label>
            <Input id="email" type="email" autoComplete="email" autoCapitalize="none" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Нууц үг<Required /></Label>
            <div className="flex overflow-hidden rounded-md border border-input">
              <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-none border-0" />
              <button type="button" aria-label={show ? 'Нууц үгийг нуух' : 'Нууц үгийг харуулах'} aria-pressed={show} onClick={() => setShow(!show)} className="flex w-11 shrink-0 cursor-pointer items-center justify-center border-l text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[#16a34a]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Намайг сануул
          </label>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Нэвтэрч байна…' : 'Нэвтрэх'}</Button>
        </form>
      </div>
    </main>
  );
}
