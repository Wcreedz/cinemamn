'use client';
import Link from 'next/link';
import type { PaymentView } from '@mongolflix/shared';
import { PageHeader, Panel, Table } from '@/components/admin/ui';
import { Badge, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { dateTime, money } from '@/lib/utils';

interface Dashboard {
  totalUsers: number; activeSubscribers: number; expiredSubscribers: number; totalPayments: number;
  monthlyRevenue: { _id: string; total: number; count: number }[];
  recentPayments: (PaymentView & { phone?: string })[];
  topMovies: { id: string; title: string; slug: string; viewCount: number }[];
  videoStatus: Record<string, number>;
}
const VIDEO: Record<string, string> = { none: 'Видеогүй', uploading: 'Байршуулж буй', queued: 'Дараалалд', processing: 'Боловсруулж буй', ready: 'Бэлэн', failed: 'Алдаатай' };

export default function AdminDashboard() {
  const { data: d, error, loading, reload } = useApi<Dashboard>('/api/admin/dashboard');
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  const revenue = d.monthlyRevenue.map((r) => money(r.total, r._id)).join(', ') || money(0);
  const stats = [['Нийт хэрэглэгч', d.totalUsers], ['Идэвхтэй эрхтэй', d.activeSubscribers], ['Эрх дууссан', d.expiredSubscribers], ['Нийт төлбөр', d.totalPayments], ['Энэ сарын орлого', revenue]] as const;
  return (
    <>
      <PageHeader title="Хянах самбар" subtitle="Системийн ерөнхий үзүүлэлт" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map(([k, v]) => <Panel key={k} className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</p><p className="mt-2 text-2xl font-black">{v}</p></Panel>)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-bold">Хамгийн их үзсэн кино</h2>
          {d.topMovies.length ? <ol className="space-y-2 text-sm">{d.topMovies.map((m) => <li key={m.id} className="flex justify-between gap-3"><Link className="hover:underline" href={`/admin/movies/${m.id}`}>{m.title}</Link><span className="text-muted-foreground">{m.viewCount}</span></li>)}</ol> : <p className="text-sm text-muted-foreground">Кино алга.</p>}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-bold">Видео боловсруулалт</h2>
          {Object.keys(d.videoStatus).length ? <div className="flex flex-wrap gap-2">{Object.entries(d.videoStatus).map(([k, v]) => <Badge key={k} tone={k === 'failed' ? 'danger' : k === 'ready' ? 'success' : 'neutral'}>{VIDEO[k] ?? k}: {v}</Badge>)}</div> : <p className="text-sm text-muted-foreground">Кино алга.</p>}
        </Panel>
      </div>
      <h2 className="mb-3 mt-8 font-bold">Сүүлийн гүйлгээ</h2>
      <Table head={['Захиалга', 'Утас', 'Дүн', 'Төлөв', 'Огноо']}>
        {d.recentPayments.map((p) => <tr key={p.id}><td className="px-4 py-3 font-mono text-xs">{p.orderNumber}</td><td className="px-4 py-3">{p.phone}</td><td className="px-4 py-3">{money(p.amount, p.currency)}</td><td className="px-4 py-3">{p.status}</td><td className="px-4 py-3">{dateTime(p.createdAt)}</td></tr>)}
      </Table>
    </>
  );
}
