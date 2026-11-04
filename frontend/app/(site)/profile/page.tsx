'use client';
import { useEffect, useState } from 'react';
import type { PublicUser } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { date } from '@/lib/utils';
import { PasswordInput, PinInput } from '@/components/ui/password-input';

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
function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      setCurrent(''); setNext('');
      setMsg({ ok: true, text: 'Нууц үг солигдлоо. Бусад төхөөрөмж гарсан.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };
  return (
    <Card className="mt-5 max-w-md p-5">
      <h2 className="mb-4 font-bold">Нууц үг солих</h2>
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <div><Label htmlFor="current">Одоогийн нууц үг</Label><PasswordInput id="current" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div><Label htmlFor="next">Шинэ нууц үг</Label><PinInput id="next" autoComplete="off" required value={next} onValue={setNext} /></div>
        {msg && <Notice tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Notice>}
        <Button type="submit">Солих</Button>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  return <><h1 className="mb-5 text-2xl font-black">Профайл</h1><AuthGate next="/profile"><Profile /><ChangePassword /></AuthGate></>;
}
