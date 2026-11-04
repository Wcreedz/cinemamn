'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { PIN_LENGTH } from '@/components/ui/password-input';
import { PinField, PinSteps } from '@/components/ui/pin-field';

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Хоёр алхам: эхний 4 орон дүүрэхэд давталт руу шилжинэ.
  const confirming = password.length === PIN_LENGTH;
  const restart = () => { setPassword(''); setConfirmPassword(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Нууц үг таарахгүй байна.');
      restart();
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
          <PinSteps step={confirming ? 1 : 0} total={2} />
          {confirming
            ? <PinField key="confirm" id="confirm" label="Шинэ нууц үг давтан" hint="Баталгаажуулахын тулд дахин оруулна уу." autoFocus disabled={busy} value={confirmPassword} onValue={setConfirmPassword} />
            : <PinField key="password" id="password" label="Шинэ 4 оронтой нууц үг" autoFocus={!!phone.trim()} disabled={busy} value={password} onValue={setPassword} />}
          {confirming && <button type="button" onClick={restart} className="block w-full cursor-pointer text-center text-sm text-muted-foreground hover:underline">Шинэ нууц үгээ дахин оруулах</button>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Солиж байна…' : 'Нууц үг солих'}</Button>
          <p className="text-sm text-muted-foreground"><Link href="/login" className="text-primary hover:underline">Нэвтрэх рүү буцах</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
