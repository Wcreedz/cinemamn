'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { PaymentView } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';

function Pay() {
  const { id } = useParams<{ id: string }>();
  const { refreshUser } = useApp();
  const { data: p, error, loading, reload, setData } = useApi<PaymentView>(`/api/payments/${id}`);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const status = p?.status;

  // QPay-г биш, зөвхөн өөрийн баазыг шалгана: төлөв нь callback-аар шинэчлэгдэнэ.
  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(() => { void api<PaymentView>(`/api/payments/${id}`).then(setData).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, [status, id, setData]);
  useEffect(() => { if (status === 'paid') void refreshUser(); }, [status, refreshUser]);

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
      <h1 className="text-xl font-black">QPay-р төлөх</h1>
      <p className="mt-1 text-sm text-muted-foreground">{p.planName} · <span className="font-bold text-foreground">{money(p.amount, p.currency)}</span></p>
      {p.qr?.image && <img src={`data:image/png;base64,${p.qr.image}`} alt="QPay QR код" className="mx-auto mt-5 size-60 rounded-lg bg-white p-2" />}
      <p className="mt-3 text-center text-xs text-muted-foreground">Банкны апп-аараа QR кодыг уншуулна уу.</p>
      {!!p.qr?.urls.length && (
        <div className="mt-5 grid grid-cols-4 gap-2 md:hidden">
          {p.qr.urls.map((u) => (
            <a key={u.link} href={u.link} className="flex flex-col items-center gap-1 text-center text-[10px]">
              {u.logo && <img src={u.logo} alt="" className="size-10 rounded-lg" />}
              <span className="line-clamp-2">{u.description || u.name}</span>
            </a>
          ))}
        </div>
      )}
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
