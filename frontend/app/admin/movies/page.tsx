'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { AdminMovie, Paginated } from '@mongolflix/shared';
import { VIDEO_LABELS } from '@/components/admin/movie-form';
import { PageHeader, Pager, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

export default function AdminMovies() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paginated<AdminMovie>>(`/api/admin/movies?page=${page}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <PageHeader title="Кино" subtitle="Нэмэх, засах, нийтлэх" actions={<Button asChild><Link href="/admin/movies/new"><Plus />Кино нэмэх</Link></Button>} />
      <Input aria-label="Хайх" placeholder="Гарчгаар хайх" className="mb-4 max-w-sm" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : !data?.items.length ? <EmptyState title="Кино алга байна" /> : (
        <>
          <Table head={['Гарчиг', 'Төлөв', 'Видео', 'Үзсэн']}>
            {data.items.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3"><Link href={`/admin/movies/${m.id}`} className="font-semibold text-primary hover:underline">{m.title}</Link>{m.featured && <Badge tone="primary" className="ml-2">Онцлох</Badge>}</td>
                <td className="px-4 py-3"><Badge tone={m.isPublished ? 'success' : 'neutral'}>{m.isPublished ? 'Нийтлэгдсэн' : 'Ноорог'}</Badge></td>
                <td className="px-4 py-3"><Badge tone={m.videoStatus === 'ready' ? 'success' : m.videoStatus === 'failed' ? 'danger' : 'neutral'}>{VIDEO_LABELS[m.videoStatus] ?? m.videoStatus}</Badge></td>
                <td className="px-4 py-3">{m.viewCount}</td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
