'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Info, Play } from 'lucide-react';
import type { HomeSection, MovieSummary, Paginated, WatchHistoryItem } from '@mongolflix/shared';
import { Carousel } from '@/components/carousel';
import { MovieCard } from '@/components/movie-card';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

function Hero() {
  const { settings } = useApp();
  const { data, loading } = useApi<{ items: MovieSummary[] }>('/api/movies/featured');
  const banner = settings?.homepage.heroBanners[0];
  const order = settings?.homepage.featuredMovieIds ?? [];
  const items = data?.items ?? [];
  const movie = items.find((m) => m.id === order[0]) ?? items[0];
  if (loading) return <Skeleton className="-mx-4 h-[55vh] rounded-none md:mx-0 md:rounded-xl" />;
  if (banner) {
    return (
      <section className="relative -mx-4 flex min-h-[50vh] items-end overflow-hidden bg-muted md:mx-0 md:rounded-xl">
        {banner.image && <img src={banner.image} alt="" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="relative max-w-xl p-6 md:p-10">
          <h1 className="text-3xl font-black md:text-5xl">{banner.title}</h1>
          {banner.subtitle && <p className="mt-3 text-sm text-gray-300 md:text-base">{banner.subtitle}</p>}
          {banner.link && <Button asChild size="lg" className="mt-5"><Link href={banner.link}>Дэлгэрэнгүй</Link></Button>}
        </div>
      </section>
    );
  }
  if (!movie) return null;
  return (
    <section className="relative -mx-4 flex min-h-[55vh] items-end overflow-hidden bg-muted md:mx-0 md:rounded-xl">
      {(movie.backdrop || movie.poster) && <img src={movie.backdrop || movie.poster} alt="" className="absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      <div className="relative max-w-xl p-6 md:p-10">
        <h1 className="text-3xl font-black md:text-5xl">{movie.title}</h1>
        {movie.description && <p className="mt-3 line-clamp-3 text-sm text-gray-300 md:text-base">{movie.description}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href={`/movies/${movie.slug}`}><Play />Үзэх</Link></Button>
          <Button asChild size="lg" variant="secondary"><Link href={`/movies/${movie.slug}`}><Info />Дэлгэрэнгүй</Link></Button>
        </div>
      </div>
    </section>
  );
}

function SectionRow({ section }: { section: HomeSection }) {
  const { user } = useApp();
  const [items, setItems] = useState<{ movie: MovieSummary; progress?: number }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (section.type === 'continue') {
        if (!user) return setItems([]);
        const r = await api<{ items: WatchHistoryItem[] }>('/api/watch-history');
        return setItems(r.items.filter((i) => !i.completed).map((i) => ({ movie: i.movie, progress: i.durationSeconds ? i.progressSeconds / i.durationSeconds : 0 })));
      }
      if (section.type === 'category') {
        const r = await api<Paginated<MovieSummary>>(`/api/movies?category=${section.categorySlug ?? ''}&limit=20`);
        return setItems(r.items.map((movie) => ({ movie })));
      }
      const r = await api<{ items: MovieSummary[] }>(section.type === 'new' ? '/api/movies/new' : '/api/movies/popular');
      setItems(r.items.map((movie) => ({ movie })));
    };
    load().catch(() => setError(true));
  }, [section.type, section.categorySlug, user]);

  if (error) return null;
  if (items === null) {
    return <Carousel title={section.title}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}</Carousel>;
  }
  if (!items.length) return null;
  return <Carousel title={section.title}>{items.map((i) => <MovieCard key={i.movie.id} movie={i.movie} progress={i.progress} />)}</Carousel>;
}

export default function HomePage() {
  const { settings } = useApp();
  const { data, error, reload, loading } = useApi<Paginated<MovieSummary>>('/api/movies?limit=1');
  const sections = useMemo(() => (settings?.homepage.sections ?? []).filter((s) => s.visible).sort((a, b) => a.order - b.order), [settings]);
  return (
    <>
      <Hero />
      {error && <div className="mt-8"><ErrorState message={error} onRetry={reload} /></div>}
      {!loading && !error && data?.total === 0 && <div className="mt-8"><EmptyState title="Одоогоор кино нэмэгдээгүй байна">Удахгүй шинэ кинонууд нэмэгдэнэ.</EmptyState></div>}
      {sections.map((s) => <SectionRow key={s.key} section={s} />)}
    </>
  );
}
