'use client';
import type { WatchHistoryItem } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { MovieCard, MovieGridSkeleton } from '@/components/movie-card';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

function History() {
  const { data, error, loading, reload } = useApi<{ items: WatchHistoryItem[] }>('/api/watch-history');
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <MovieGridSkeleton />;
  if (!data?.items.length) return <EmptyState title="Та одоогоор кино үзээгүй байна" />;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {data.items.map((i) => <MovieCard key={i.movie.id} movie={i.movie} progress={i.durationSeconds ? i.progressSeconds / i.durationSeconds : 0} />)}
    </div>
  );
}
export default function MyMoviesPage() {
  return <><h1 className="mb-5 text-2xl font-black">Миний кино</h1><AuthGate next="/my-movies"><History /></AuthGate></>;
}
