'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { PasswordInput } from '@/components/ui/password-input';

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Нууц үг таарахгүй байна.');
      return;
    }
    setBusy(true); setError(null);
    try {
      await api('/api/auth/reset-password', { body: { phone, password, confirmPassword } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Нууц үг солих">
      {done ? (
        <div className="space-y-4">
          <Notice tone="success">Нууц үг солигдлоо.</Notice>
          <Button asChild className="w-full"><Link href="/login">Нэвтрэх</Link></Button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div><Label htmlFor="phone">Утасны дугаар</Label><Input id="phone" inputMode="tel" autoComplete="tel" required placeholder="9911 2233" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label htmlFor="password">Шинэ нууц үг</Label><PasswordInput id="password" autoComplete="off" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><Label htmlFor="confirm">Шинэ нууц үг давтан</Label><PasswordInput id="confirm" autoComplete="off" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Солиж байна…' : 'Нууц үг солих'}</Button>
          <p className="text-sm text-muted-foreground"><Link href="/login" className="text-primary hover:underline">Нэвтрэх рүү буцах</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
