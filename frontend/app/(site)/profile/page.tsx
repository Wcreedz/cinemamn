'use client';
import { useEffect, useState } from 'react';
import type { PublicUser } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, Notice } from '@/components/ui/misc';
import { api, ApiClientError } from '@/lib/api';
import { date } from '@/lib/utils';
import { PasswordInput, PIN_LENGTH } from '@/components/ui/password-input';
import { PinField, PinSteps } from '@/components/ui/pin-field';

function Profile() {
  const { user, setUser } = useApp();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setName(user?.name ?? ''); }, [user]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ user: PublicUser }>('/api/auth/me', { method: 'PATCH', body: { name } });
      setUser(r.user);
      setMsg({ ok: true, text: 'Хадгалагдлаа.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };
  return (
    <Card className="max-w-md p-5">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <div><Label>Утасны дугаар</Label><Input value={user?.phone ?? ''} disabled /></div>
        <div><Label htmlFor="name">Нэр</Label><Input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Бүртгүүлсэн: {date(user?.createdAt)}</p>
        {msg && <Notice tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Notice>}
        <Button type="submit">Хадгалах</Button>
      </form>
    </Card>
  );
}
const PIN_STEPS = 3;

// Одоогийн нууц үг → шинэ → давтан. 4 оронтой дүрмээс өмнөх хэрэглэгчийн одоогийн нууц үг урт байж болно.
function ChangePassword() {
  const [step, setStep] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clearNew = () => { setNext(''); setConfirm(''); };

  const finish = async () => {
    if (next !== confirm) {
      clearNew(); setStep(1);
      setMsg({ ok: false, text: 'Нууц үг таарахгүй байна.' });
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      setCurrent(''); clearNew(); setStep(0); setLegacy(false);
      setMsg({ ok: true, text: 'Нууц үг солигдлоо. Бусад төхөөрөмж гарсан.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
      if ((err as ApiClientError).code === 'WRONG_PASSWORD') { setCurrent(''); clearNew(); setStep(0); }
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (step < PIN_STEPS - 1) setStep(step + 1);
    else void finish();
  };
  const ready = [legacy ? current.length > 0 : current.length === PIN_LENGTH, next.length === PIN_LENGTH, confirm.length === PIN_LENGTH][step];

  return (
    <Card className="mt-5 max-w-md p-5">
      <h2 className="mb-4 font-bold">Нууц үг солих</h2>
      <form onSubmit={submit} className="space-y-4">
        <PinSteps step={step} total={PIN_STEPS} />
        {step === 0 && (legacy
          ? <div><Label htmlFor="current">Одоогийн нууц үг</Label><PasswordInput id="current" autoComplete="current-password" required autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          : <PinField key="current" id="current" label="Одоогийн нууц үг" hint="Баталгаажуулахын тулд одоогийн нууц үгээ оруулна уу." autoComplete="current-password" value={current} onValue={setCurrent} />)}
        {step === 0 && <button type="button" onClick={() => { setLegacy(!legacy); setCurrent(''); }} className="block w-full cursor-pointer text-center text-sm text-muted-foreground hover:underline">{legacy ? '4 оронтой нууц үг оруулах' : 'Хуучин урт нууц үгтэй'}</button>}
        {step === 1 && <PinField key="next" id="next" label="Шинэ нууц үг" hint="4 оронтой шинэ нууц үгээ оруулна уу." autoFocus value={next} onValue={setNext} />}
        {step === 2 && <PinField key="confirm" id="confirm" label="Шинэ нууц үг давтан" hint="Баталгаажуулахын тулд дахин оруулна уу." autoFocus disabled={busy} value={confirm} onValue={setConfirm} />}
        {msg && <Notice tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Notice>}
        <div className="flex gap-2">
          {step > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setMsg(null); setStep(step - 1); }}>Буцах</Button>}
          <Button type="submit" className="flex-1" disabled={!ready || busy}>{step === PIN_STEPS - 1 ? (busy ? 'Сольж байна…' : 'Солих') : 'Үргэлжлүүлэх'}</Button>
        </div>
      </form>
    </Card>
  );
}
export default function ProfilePage() {
  return <><h1 className="mb-5 text-2xl font-black">Профайл</h1><AuthGate next="/profile"><Profile /><ChangePassword /></AuthGate></>;
}
