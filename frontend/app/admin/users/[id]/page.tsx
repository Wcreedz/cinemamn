'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { PaymentView, PublicUser, SubscriptionView } from '@mongolflix/shared';
import { Field, NumberInput, PageHeader, Panel, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { date, dateTime, money } from '@/lib/utils';

interface Detail {
  user: PublicUser; expiresAt: string | null; hasActive: boolean; subscriptions: SubscriptionView[]; payments: PaymentView[];
  watchHistory: { title?: string; progressSeconds: number; durationSeconds: number; lastWatchedAt: string }[];
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, loading, reload } = useApi<Detail>(`/api/admin/users/${id}`);
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg({ ok: true, text: ok }); await reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <>
      <PageHeader title={d.user.phone} subtitle={`${d.user.name || 'Нэргүй'} · ${d.user.role}`} actions={
        <Button variant={d.user.status === 'active' ? 'destructive' : 'default'} onClick={() => void act(() => api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: { status: d.user.status === 'active' ? 'blocked' : 'active' } }), 'Төлөв шинэчлэгдлээ.')}>
          {d.user.status === 'active' ? 'Блоклох' : 'Блок нээх'}
        </Button>
      } />
      {msg && <Notice tone={msg.ok ? 'success' : 'danger'} className="mb-4">{msg.text}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-2 font-bold">Эрх</h2>
          <p className="text-sm">{d.hasActive ? <Badge tone="success">Идэвхтэй</Badge> : <Badge>Идэвхгүй</Badge>} {d.expiresAt && <span className="ml-2 text-muted-foreground">Дуусах: {date(d.expiresAt)}</span>}</p>
        </Panel>
        <Panel>
          <h2 className="mb-3 font-bold">Эрх сунгах</h2>
          <div className="grid gap-3 sm:grid-cols-[6rem_1fr_auto] sm:items-end">
            <Field label="Хоног"><NumberInput min={1} value={days} onChange={setDays} /></Field>
            <Field label="Шалтгаан"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <Button disabled={!note.trim()} onClick={() => void act(() => api(`/api/admin/subscriptions/${id}/extend`, { body: { days, note } }), 'Эрх сунгагдлаа.').then(() => setNote(''))}>Сунгах</Button>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 font-bold">Нууц үг шинэчлэх</h2>
          <p className="mb-3 text-xs text-muted-foreground">Хэрэглэгч нууц үгээ мартсан үед. Хуучин бүх сешн хаагдаж, түгжээ арилна.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Шинэ нууц үг" hint="Дор хаяж 8 тэмдэгт."><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button disabled={password.length < 8} onClick={() => void act(() => api(`/api/admin/users/${id}/password`, { method: 'PATCH', body: { password } }), 'Нууц үг шинэчлэгдлээ.').then(() => setPassword(''))}>Шинэчлэх</Button>
          </div>
        </Panel>
      </div>
      <h2 className="mb-3 mt-8 font-bold">Төлбөрийн түүх</h2>
      <Table head={['Захиалга', 'Дүн', 'Төлөв', 'Огноо']}>{d.payments.map((p) => <tr key={p.id}><td className="px-4 py-3 font-mono text-xs">{p.orderNumber}</td><td className="px-4 py-3">{money(p.amount, p.currency)}</td><td className="px-4 py-3">{p.status}</td><td className="px-4 py-3">{dateTime(p.createdAt)}</td></tr>)}</Table>
      <h2 className="mb-3 mt-8 font-bold">Эрхийн түүх</h2>
      <Table head={['Багц', 'Төлөв', 'Эхлэх', 'Дуусах']}>{d.subscriptions.map((s) => <tr key={s.id}><td className="px-4 py-3">{s.planCode}</td><td className="px-4 py-3">{s.status}</td><td className="px-4 py-3">{date(s.startedAt)}</td><td className="px-4 py-3">{date(s.expiresAt)}</td></tr>)}</Table>
      <h2 className="mb-3 mt-8 font-bold">Үзсэн түүх</h2>
      <Table head={['Кино', 'Явц', 'Огноо']}>{d.watchHistory.map((w, i) => <tr key={i}><td className="px-4 py-3">{w.title}</td><td className="px-4 py-3">{Math.round(w.progressSeconds / 60)} / {Math.round(w.durationSeconds / 60)} мин</td><td className="px-4 py-3">{dateTime(w.lastWatchedAt)}</td></tr>)}</Table>
    </>
  );
}
