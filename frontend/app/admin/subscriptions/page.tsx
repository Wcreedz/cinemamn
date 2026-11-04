'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Paginated, SubscriptionView } from '@mongolflix/shared';
import { PageHeader, Table } from '@/components/admin/ui';
import { Select } from '@/components/ui/input';
import { Badge, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';
import { date, money } from '@/lib/utils';

type Row = SubscriptionView & { phone?: string; userId: string; note?: string };

export default function AdminSubscriptions() {
  const [status, setStatus] = useState('');
  const pager = usePagination();
  const { setPage } = pager;
  const { data, error, loading, reload } = useApi<Paginated<Row>>(`/api/admin/subscriptions?${pager.query}${status ? `&status=${status}` : ''}`);
  return (
    <>
      <PageHeader title="Эрхүүд" subtitle="Сунгахдаа хэрэглэгчийн хуудас руу орно" />
      <Select aria-label="Төлөв" className="mb-4 w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
        <option value="">Бүх төлөв</option><option value="active">Идэвхтэй</option><option value="expired">Дууссан</option><option value="cancelled">Цуцлагдсан</option>
      </Select>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : (
        <>
          <Table head={['Утас', 'Багц', 'Дүн', 'Төлөв', 'Эхлэх', 'Дуусах', 'Тэмдэглэл']} paging={data ?? undefined} pager={pager}>
            {data?.items.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3"><Link href={`/admin/users/${s.userId}`} className="font-semibold text-primary hover:underline">{s.phone}</Link></td>
                <td className="px-4 py-3">{s.planCode}</td><td className="px-4 py-3">{money(s.amount, s.currency)}</td>
                <td className="px-4 py-3"><Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge></td>
                <td className="px-4 py-3">{date(s.startedAt)}</td><td className="px-4 py-3">{date(s.expiresAt)}</td><td className="px-4 py-3 text-xs">{s.note}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
