'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Category, MovieSummary, Paginated } from '@mongolflix/shared';
import { CatalogBanner } from '@/components/catalog-banner';
import { MovieGrid, MovieGridSkeleton } from '@/components/movie-card';
import { useApp } from '@/components/providers';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';

function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const banner = useApp().settings?.homepage.catalogBanner;
  const category = params.get('category') ?? '';
  const [sort, setSort] = useState('new');
  const pager = usePagination();
  const { setPage } = pager;
  const cats = useApi<{ items: Category[] }>('/api/categories');
  const { data, error, loading, reload } = useApi<Paginated<MovieSummary>>(`/api/movies?${pager.query}&sort=${sort}${category ? `&category=${category}` : ''}`);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-black">Кино</h1>
        {banner && <CatalogBanner banner={banner} />}
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
          <Pagination paging={data} pager={pager} className="mt-6" />
        </>
      )}
    </>
  );
}
export default function HomePage() {
  return <Suspense fallback={<MovieGridSkeleton />}><Catalog /></Suspense>;
}
