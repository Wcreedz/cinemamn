'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { OtpFlow } from '@/components/otp-flow';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth/reset-password', { body: { verificationToken: token, password } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <AuthShell title="Нууц үг сэргээх">
      {done ? (
        <div className="space-y-4"><Notice tone="success">Нууц үг шинэчлэгдлээ.</Notice><Button asChild className="w-full"><Link href="/login">Нэвтрэх</Link></Button></div>
      ) : !token ? <OtpFlow purpose="reset" onVerified={setToken} /> : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div><Label htmlFor="password">Шинэ нууц үг</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full">Хадгалах</Button>
        </form>
      )}
    </AuthShell>
  );
}
