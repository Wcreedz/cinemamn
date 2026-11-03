'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { AdminMovie, Paginated } from '@mongolflix/shared';
import { VideoBadge } from '@/components/admin/movie-form';
import { PageHeader, Pager, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

const POLL_MS = 5000;
const PROCESSING_NOTE = 'Кино боловсруулагдаж байна: хуудсаа хаасан ч үргэлжилнэ, дуусмагц "Бэлэн" болно.';
const NOTICES: Record<string, string> = {
  created: 'Кино нэмэгдлээ.',
  saved: 'Хадгалагдлаа.',
  'created-video': `Кино нэмэгдлээ. ${PROCESSING_NOTE}`,
  'saved-video': `Хадгалагдлаа. ${PROCESSING_NOTE}`,
};

function SavedNotice() {
  const params = useSearchParams();
  const text = NOTICES[params.get('notice') ?? ''];
  if (!text) return null;
  return (
    <div className="mb-4 space-y-2">
      <Notice tone="success">{text}</Notice>
      {params.get('draft') && <Notice tone="warning">Нийтлээгүй тул сайтад харагдахгүй. Харуулах бол киногоо нээгээд &quot;Нийтлэх&quot;-ийг асаана уу.</Notice>}
    </div>
  );
}

export default function AdminMovies() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paginated<AdminMovie>>(`/api/admin/movies?page=${page}&q=${encodeURIComponent(q)}`);
  const working = !!data?.items.some((m) => m.videoStatus === 'queued' || m.videoStatus === 'processing');

  // Worker дуусахад хуудсаа шинэчлэхгүйгээр төлөв солигдоно.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(t);
  }, [working, reload]);

  return (
    <>
      <PageHeader title="Кино" subtitle="Нэмэх, засах, нийтлэх" actions={<Button asChild><Link href="/admin/movies/new"><Plus />Кино нэмэх</Link></Button>} />
      <Suspense><SavedNotice /></Suspense>
      <Input aria-label="Хайх" placeholder="Гарчгаар хайх" className="mb-4 max-w-sm" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : !data?.items.length ? <EmptyState title="Кино алга байна" /> : (
        <>
          <Table head={['Гарчиг', 'Төлөв', 'Видео', 'Үзсэн']}>
            {data.items.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3"><Link href={`/admin/movies/${m.id}`} className="font-semibold text-primary hover:underline">{m.title}</Link>{m.featured && <Badge tone="primary" className="ml-2">Онцлох</Badge>}</td>
                <td className="px-4 py-3"><Badge tone={m.isPublished ? 'success' : 'neutral'}>{m.isPublished ? 'Нийтлэгдсэн' : 'Ноорог: сайтад харагдахгүй'}</Badge></td>
                <td className="px-4 py-3"><VideoBadge movie={m} /></td>
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
