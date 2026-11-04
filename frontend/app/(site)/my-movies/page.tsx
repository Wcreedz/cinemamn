'use client';
import type { Paginated, WatchHistoryItem } from '@mongolflix/shared';
import { AuthGate } from '@/components/auth-gate';
import { MovieCard, MovieGridSkeleton } from '@/components/movie-card';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';
import { runtime } from '@/lib/utils';

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

function ContinueCard({ item }: { item: WatchHistoryItem }) {
  const { durationSeconds: duration, progressSeconds: position } = item;
  const left = runtime(Math.max(duration - position, 0));
  return <MovieCard movie={item.movie} resume progress={duration ? position / duration : 0} note={left ? `${left} үлдсэн` : undefined} />;
}

function History() {
  const unfinishedPager = usePagination();
  const finishedPager = usePagination();
  const unfinished = useApi<Paginated<WatchHistoryItem>>(`/api/watch-history?completed=false&${unfinishedPager.query}`);
  const finished = useApi<Paginated<WatchHistoryItem>>(`/api/watch-history?completed=true&${finishedPager.query}`);
  const error = unfinished.error ?? finished.error;
  if (error) return <ErrorState message={error} onRetry={() => { void unfinished.reload(); void finished.reload(); }} />;
  if (!unfinished.data || !finished.data) return <MovieGridSkeleton />;
  if (!unfinished.data.total && !finished.data.total) return <EmptyState title="Та одоогоор кино үзээгүй байна" />;
  return (
    <div className="space-y-8">
      {unfinished.data.total > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Үргэлжлүүлэн үзэх</h2>
          <div className={GRID}>{unfinished.data.items.map((i) => <ContinueCard key={i.movie.id} item={i} />)}</div>
          <Pagination paging={unfinished.data} pager={unfinishedPager} />
        </section>
      )}
      {finished.data.total > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Үзэж дууссан</h2>
          <div className={GRID}>{finished.data.items.map((i) => <MovieCard key={i.movie.id} movie={i.movie} />)}</div>
          <Pagination paging={finished.data} pager={finishedPager} />
        </section>
      )}
    </div>
  );
}
export default function MyMoviesPage() {
  return <><h1 className="mb-5 text-2xl font-black">Миний кино</h1><AuthGate next="/my-movies"><History /></AuthGate></>;
}
