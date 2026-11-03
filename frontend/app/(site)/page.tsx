'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Category, MovieSummary, Paginated } from '@mongolflix/shared';
import { MovieGrid, MovieGridSkeleton } from '@/components/movie-card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const category = params.get('category') ?? '';
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const cats = useApi<{ items: Category[] }>('/api/categories');
  const { data, error, loading, reload } = useApi<Paginated<MovieSummary>>(`/api/movies?page=${page}&sort=${sort}${category ? `&category=${category}` : ''}`);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-black">Кино</h1>
        <Select aria-label="Ангилал" className="w-auto" value={category} onChange={(e) => { setPage(1); router.push(e.target.value ? `/?category=${e.target.value}` : '/'); }}>
          <option value="">Бүх ангилал</option>
          {cats.data?.items.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
        <Select aria-label="Эрэмбэ" className="w-auto" value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
          <option value="new">Шинэ нь эхэндээ</option>
          <option value="popular">Түгээмэл</option>
          <option value="title">Нэрээр</option>
        </Select>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <MovieGridSkeleton /> : !data?.items.length ? <EmptyState title="Кино олдсонгүй" /> : (
        <>
          <MovieGrid movies={data.items} />
          {data.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Өмнөх</Button>
              <span className="text-sm text-muted-foreground">{page} / {data.pages}</span>
              <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Дараах</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
export default function HomePage() {
  return <Suspense fallback={<MovieGridSkeleton />}><Catalog /></Suspense>;
}
