'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { PaymentView } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { QPayOptions } from '@/components/qpay-options';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';

// Нэхэмжлэхийн хүчинтэй хугацааны үлдэгдэл.
function useCountdown(expiresAt?: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return left === null ? null : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function Pay() {
  const { id } = useParams<{ id: string }>();
  const { refreshUser } = useApp();
  const { data: p, error, loading, reload, setData } = useApi<PaymentView>(`/api/payments/${id}`);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const status = p?.status;
  const countdown = useCountdown(p?.expiresAt);

  // QPay-г биш, зөвхөн өөрийн баазыг шалгана: төлөв нь callback-аар шинэчлэгдэнэ.
  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(() => { void api<PaymentView>(`/api/payments/${id}`).then(setData).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, [status, id, setData]);
  useEffect(() => { if (status === 'paid') void refreshUser(); }, [status, refreshUser]);
  // Банкны апп-аас буцаж ирэхэд шууд шалгана. Сервер cooldown-оор QPay-н дуудлагыг хязгаарладаг.
  useEffect(() => {
    if (status !== 'pending') return;
    const onReturn = () => {
      if (document.visibilityState === 'visible') void api<PaymentView>(`/api/payments/${id}/check`, { method: 'POST' }).then(setData).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, [status, id, setData]);

  const check = async () => {
    setChecking(true); setNote(null);
    try {
      const next = await api<PaymentView>(`/api/payments/${id}/check`, { method: 'POST' });
      setData(next);
      if (next.status === 'pending') setNote('Төлбөр одоогоор баталгаажаагүй байна. Төлсөн бол хэдэн секунд хүлээгээд дахин шалгана уу.');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const simulate = async () => {
    setData(await api<PaymentView>(`/api/payments/${id}/dev-simulate`, { body: {} }));
  };

  if (loading && !p) return <Skeleton className="mx-auto h-96 max-w-md" />;
  if (error || !p) return <ErrorState message={error ?? 'Төлбөр олдсонгүй.'} onRetry={reload} />;
  if (p.status === 'paid') {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h1 className="mt-3 text-xl font-black">Төлбөр амжилттай</h1>
        <p className="mt-1 text-sm text-muted-foreground">{p.planName} идэвхжлээ.</p>
        <Button asChild className="mt-5"><Link href="/movies">Кино үзэх</Link></Button>
      </Card>
    );
  }
  if (p.status !== 'pending') {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <XCircle className="mx-auto size-14 text-destructive" />
        <h1 className="mt-3 text-xl font-black">{p.status === 'expired' ? 'Нэхэмжлэхийн хугацаа дууссан' : 'Төлбөр баталгаажсангүй'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.failureReason === 'AMOUNT_MISMATCH' ? 'Төлсөн дүн нэхэмжлэхтэй таарсангүй. Админтай холбогдоно уу.' : 'Дахин нэхэмжлэх үүсгэнэ үү.'}
        </p>
        <Button asChild className="mt-5"><Link href="/subscription">Буцах</Link></Button>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black">QPay-р төлөх</h1>
        {countdown && <span aria-label="Үлдсэн хугацаа" className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm font-bold text-warning">{countdown}</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{p.planName} · <span className="font-bold text-foreground">{money(p.amount, p.currency)}</span></p>
      <div className="mt-5">{p.qr && <QPayOptions qr={p.qr} />}</div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Төлбөр төлсний дараа эрх автоматаар идэвхжинэ. 1 минутын дотор идэвхжихгүй бол “Төлбөр шалгах” дарна уу.</p>
      {note && <Notice tone="warning" className="mt-4">{note}</Notice>}
      <Button className="mt-5 w-full" disabled={checking} onClick={() => void check()}>{checking ? 'Шалгаж байна…' : 'Төлбөр шалгах'}</Button>
      {process.env.NODE_ENV !== 'production' && (
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void simulate()}>Хөгжүүлэлт: төлбөр дууриах</Button>
      )}
    </Card>
  );
}
export default function PayPage() {
  return <AuthGate next="/subscription"><Pay /></AuthGate>;
}
