'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Crown } from 'lucide-react';
import type { Paginated, PaymentView, PlansResponse, SubscriptionMe } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';
import { api } from '@/lib/api';
import { date, money } from '@/lib/utils';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  paid: { label: 'Төлөгдсөн', tone: 'success' }, pending: { label: 'Хүлээгдэж буй', tone: 'warning' },
  failed: { label: 'Амжилтгүй', tone: 'danger' }, expired: { label: 'Хугацаа дууссан', tone: 'neutral' }, refunded: { label: 'Буцаагдсан', tone: 'neutral' },
};

function Content() {
  const router = useRouter();
  const plans = useApi<PlansResponse>('/api/subscriptions/plans');
  const me = useApi<SubscriptionMe>('/api/subscriptions/me');
  const pager = usePagination();
  const history = useApi<Paginated<PaymentView>>(`/api/payments/history?${pager.query}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (planCode: string) => {
    setBusy(planCode); setError(null);
    try {
      // Зөвхөн багцын код илгээнэ: дүнг сервер өөрөө тооцно.
      const p = await api<PaymentView>('/api/qpayGargaya', { body: { planCode } });
      router.push(`/subscription/pay/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  if (plans.error) return <ErrorState message={plans.error} onRetry={plans.reload} />;
  return (
    <div className="space-y-8">
      <Card className="p-5">
        {me.loading ? <Skeleton className="h-12" /> : me.data?.hasAccess && me.data.expiresAt ? (
          <div className="flex items-center gap-3"><Crown className="size-8 text-warning" />
            <div><p className="font-bold">Таны эрх идэвхтэй</p><p className="text-sm text-muted-foreground">Дуусах огноо: {date(me.data.expiresAt)}</p></div>
          </div>
        ) : me.data?.hasAccess ? <p className="font-bold">Төлбөргүйгээр үзэх боломжтой.</p> : <p className="font-bold">Танд идэвхтэй эрх алга байна.</p>}
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <section aria-label="Багцууд">
        <h2 className="mb-3 text-lg font-bold">Багц сонгох</h2>
        {plans.loading ? <Skeleton className="h-44 max-w-sm" /> : plans.data?.enabled === false ? <Notice tone="warning">Эрх худалдан авах боломж одоогоор хаалттай байна.</Notice> : (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.data?.plans.map((p) => (
              <Card key={p.code} className="flex flex-col p-5">
                <p className="font-bold">{p.name}</p>
                <p className="mt-2 text-3xl font-black text-primary">{money(p.price, p.currency)}</p>
                <p className="text-sm text-muted-foreground">{p.durationDays} хоног</p>
                <ul className="my-4 space-y-1 text-sm">
                  <li className="flex items-center gap-2"><Check className="size-4 text-success" />Бүх кино үзэх</li>
                  <li className="flex items-center gap-2"><Check className="size-4 text-success" />Эрх идэвхтэй бол дуусах огнооноос сунгагдана</li>
                </ul>
                <Button className="mt-auto" disabled={busy !== null} onClick={() => void buy(p.code)}>{busy === p.code ? 'Үүсгэж байна…' : me.data?.hasAccess ? 'Сунгах' : 'QPay-р төлөх'}</Button>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section aria-label="Төлбөрийн түүх">
        <h2 className="mb-3 text-lg font-bold">Төлбөрийн түүх</h2>
        {history.loading && !history.data ? <Skeleton className="h-24" /> : !history.data?.items.length ? <EmptyState title="Төлбөрийн түүх хоосон байна" /> : (
          <><Card className="divide-y">
            {history.data.items.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div><p className="font-semibold">{p.planName} · {money(p.amount, p.currency)}</p><p className="text-xs text-muted-foreground">{date(p.createdAt)} · {p.orderNumber}</p></div>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
              </div>
            ))}
          </Card>
          <Pagination paging={history.data} pager={pager} /></>
        )}
      </section>
    </div>
  );
}
export default function SubscriptionPage() {
  return <><h1 className="mb-5 text-2xl font-black">Миний эрх</h1><AuthGate next="/subscription"><Content /></AuthGate></>;
}
