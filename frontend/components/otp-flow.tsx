'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';

// Утас -> SMS код -> баталгаажуулсан токен гэсэн алхмууд. Бүртгэл, нууц үг сэргээхэд хамтарна.
export function OtpFlow({ purpose, onVerified }: { purpose: 'register' | 'reset'; onVerified: (token: string) => void }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ resendCooldownSeconds: number }>('/api/auth/send-otp', { body: { phone, purpose } });
      setCooldown(r.resendCooldownSeconds);
      setStep('code');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ verificationToken: string }>('/api/auth/verify-otp', { body: { phone, purpose, code } });
      onVerified(r.verificationToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'phone') {
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div><Label htmlFor="phone">Утасны дугаар</Label><Input id="phone" inputMode="tel" autoComplete="tel" required placeholder="9911 2233" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Илгээж байна…' : 'Код авах'}</Button>
      </form>
    );
  }
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
      <p className="text-sm text-muted-foreground">{phone} дугаарт бүртгэлтэй бол SMS код илгээгдсэн.</p>
      <div><Label htmlFor="code">Баталгаажуулах код</Label><Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.4em]" /></div>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>Баталгаажуулах</Button>
      <Button type="button" variant="ghost" className="w-full" disabled={busy || cooldown > 0} onClick={() => void send()}>{cooldown > 0 ? `Дахин авах (${cooldown}с)` : 'Дахин код авах'}</Button>
    </form>
  );
}
