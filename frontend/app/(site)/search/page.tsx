'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { MovieSummary, Paginated } from '@mongolflix/shared';
import { MovieGrid, MovieGridSkeleton } from '@/components/movie-card';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';

function Search() {
  const q = (useSearchParams().get('q') ?? '').trim();
  if (!q) return <EmptyState title="Хайх үгээ бичнэ үү">Киноны нэрээр хайна.</EmptyState>;
  // key: шинэ үгээр хайхад хуудас 1-ээс эхэлнэ.
  return <Results key={q} q={q} />;
}

function Results({ q }: { q: string }) {
  const pager = usePagination();
  const { data, error, loading, reload } = useApi<Paginated<MovieSummary>>(`/api/search?q=${encodeURIComponent(q)}&${pager.query}`);
  return (
    <>
      <h1 className="mb-5 text-2xl font-black">“{q}” хайлтын үр дүн</h1>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <MovieGridSkeleton /> : !data?.items.length ? <EmptyState title="Илэрц олдсонгүй">Өөр үгээр хайж үзнэ үү.</EmptyState> : <><MovieGrid movies={data.items} /><Pagination paging={data} pager={pager} className="mt-6" /></>}
    </>
  );
}
export default function SearchPage() {
  return <Suspense fallback={<MovieGridSkeleton />}><Search /></Suspense>;
}
