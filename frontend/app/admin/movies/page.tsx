'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { AdminMovie, Paginated } from '@mongolflix/shared';
import { VideoBadge, VideoTimes, videoErrorText } from '@/components/admin/movie-form';
import { PageHeader, Pager, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Banner, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

const POLL_MS = 5000;
const PROCESSING_NOTE = 'Файл серверт хүрлээ. Боловсруулалтын явцыг доорх жагсаалтаас харна уу: хуудсаа хаасан ч үргэлжилнэ.';
const NOTICES: Record<string, string> = {
  created: 'Кино нэмэгдлээ.',
  saved: 'Хадгалагдлаа.',
  'created-video': 'Кино нэмэгдлээ.',
  'saved-video': 'Хадгалагдлаа.',
};

function SavedNotice() {
  const params = useSearchParams();
  const text = NOTICES[params.get('notice') ?? ''];
  if (!text) return null;
  const notice = params.get('notice');
  return (
    <div className="mb-4 space-y-2">
      <Banner tone="success" title={text}>{notice?.endsWith('-video') && PROCESSING_NOTE}</Banner>
      {notice === 'created' && <Banner tone="warning" title="Кино файл оруулаагүй байна">Файлгүй тул хэрэглэгчид үзэх боломжгүй. Киногоо нээгээд файлаа сонгоно уу.</Banner>}
      {params.get('draft') && <Banner tone="warning" title="Сайтад харагдахгүй">Нийтлээгүй байна. Харуулах бол киногоо нээгээд &quot;Нийтлэх&quot;-ийг асаана уу.</Banner>}
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
                <td className="px-4 py-3"><VideoBadge movie={m} /><VideoTimes movie={m} />{m.videoError && <p className="mt-1 max-w-xs text-xs font-medium text-destructive">{videoErrorText(m.videoError)}</p>}</td>
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
