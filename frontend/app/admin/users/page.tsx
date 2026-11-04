'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Paginated, PublicUser } from '@mongolflix/shared';
import { PageHeader, Table } from '@/components/admin/ui';
import { Input } from '@/components/ui/input';
import { Badge, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';
import { dateTime } from '@/lib/utils';

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const pager = usePagination();
  const { setPage } = pager;
  const { data, error, loading, reload } = useApi<Paginated<PublicUser>>(`/api/admin/users?${pager.query}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <PageHeader title="Хэрэглэгчид" subtitle="Хайх, блоклох, эрх сунгах" />
      <Input aria-label="Утасаар хайх" placeholder="Утасны дугаараар хайх" className="mb-4 max-w-sm" value={q} onChange={(e) => { setPage(1); setQ(e.target.value.replace(/[^\d+]/g, '')); }} />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : (
        <>
          <Table head={['Утас', 'Нэр', 'Эрх', 'Төлөв', 'Бүртгэсэн', 'Сүүлд нэвтэрсэн']} paging={data ?? undefined} pager={pager}>
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><Link href={`/admin/users/${u.id}`} className="font-semibold text-primary hover:underline">{u.phone}</Link></td>
                <td className="px-4 py-3">{u.name}</td><td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3"><Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status === 'active' ? 'Идэвхтэй' : 'Блоклогдсон'}</Badge></td>
                <td className="px-4 py-3">{dateTime(u.createdAt)}</td><td className="px-4 py-3">{dateTime(u.lastLoginAt)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
