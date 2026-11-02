'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { MovieSummary, Paginated } from '@mongolflix/shared';
import { MovieGrid, MovieGridSkeleton } from '@/components/movie-card';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

function Results() {
  const q = useSearchParams().get('q') ?? '';
  const { data, error, loading, reload } = useApi<Paginated<MovieSummary>>(q ? `/api/search?q=${encodeURIComponent(q)}` : null);
  return (
    <>
      <h1 className="mb-5 text-2xl font-black">“{q}” хайлтын үр дүн</h1>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <MovieGridSkeleton /> : !data?.items.length ? <EmptyState title="Илэрц олдсонгүй">Өөр үгээр хайж үзнэ үү.</EmptyState> : <MovieGrid movies={data.items} />}
    </>
  );
}
export default function SearchPage() {
  return <Suspense fallback={<MovieGridSkeleton />}><Results /></Suspense>;
}
