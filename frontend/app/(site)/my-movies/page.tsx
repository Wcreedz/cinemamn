'use client';
import type { WatchHistoryItem } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { MovieCard, MovieGridSkeleton } from '@/components/movie-card';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { runtime } from '@/lib/utils';

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

function ContinueCard({ item }: { item: WatchHistoryItem }) {
  const { durationSeconds: duration, progressSeconds: position } = item;
  const left = runtime(Math.max(duration - position, 0));
  return <MovieCard movie={item.movie} resume progress={duration ? position / duration : 0} note={left ? `${left} үлдсэн` : undefined} />;
}

function History() {
  const { data, error, loading, reload } = useApi<{ items: WatchHistoryItem[] }>('/api/watch-history');
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <MovieGridSkeleton />;
  if (!data?.items.length) return <EmptyState title="Та одоогоор кино үзээгүй байна" />;
  const unfinished = data.items.filter((i) => !i.completed);
  const finished = data.items.filter((i) => i.completed);
  return (
    <div className="space-y-8">
      {unfinished.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Үргэлжлүүлэн үзэх</h2>
          <div className={GRID}>{unfinished.map((i) => <ContinueCard key={i.movie.id} item={i} />)}</div>
        </section>
      )}
      {finished.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Үзэж дууссан</h2>
          <div className={GRID}>{finished.map((i) => <MovieCard key={i.movie.id} movie={i.movie} />)}</div>
        </section>
      )}
    </div>
  );
}
export default function MyMoviesPage() {
  return <><h1 className="mb-5 text-2xl font-black">Миний кино</h1><AuthGate next="/my-movies"><History /></AuthGate></>;
}
