'use client';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Info, Play } from 'lucide-react';
import type { AdBanner, HomeSection, MovieSummary, Paginated, WatchHistoryItem } from '@mongolflix/shared';
import { Carousel } from '@/components/carousel';
import { BannerLink, HeroSlider, type Slide } from '@/components/hero-slider';
import { MovieCard } from '@/components/movie-card';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const MOVIE_SLIDES = 5;

function Hero() {
  const { settings } = useApp();
  const { data, loading } = useApi<{ items: MovieSummary[] }>('/api/movies/featured');
  const banners = settings?.homepage.heroBanners ?? [];
  const order = settings?.homepage.featuredMovieIds ?? [];
  if (loading && !banners.length) return <Skeleton className="-mx-4 h-72 rounded-none md:mx-0 md:h-[60vh] md:min-h-80 md:rounded-xl" />;
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  // Админ слайд нэмээгүй бол "Онцлох" кинонууд эргэлдэнэ.
  const slides: Slide[] = banners.length
    ? banners.map((b, i) => ({
        key: `${i}-${b.image ?? b.title}`, image: b.image, title: b.title, text: b.subtitle, link: b.link,
        actions: b.link && <Button asChild size="lg" className="mt-5"><BannerLink href={b.link}>Дэлгэрэнгүй</BannerLink></Button>,
      }))
    : [...(data?.items ?? [])].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, MOVIE_SLIDES).map((m) => ({
        key: m.id, image: m.backdrop || m.poster, title: m.title, text: m.description,
        actions: (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href={`/movies/${m.slug}`}><Play />Үзэх</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href={`/movies/${m.slug}`}><Info />Дэлгэрэнгүй</Link></Button>
          </div>
        ),
      }));
  return <HeroSlider slides={slides} />;
}

function AdStrip({ ad }: { ad: AdBanner }) {
  const image = <img src={ad.image} alt="Зар" loading="lazy" className="block h-auto w-full" />;
  return (
    <aside aria-label="Зар" className="relative mt-8 overflow-hidden rounded-xl">
      {ad.link ? <BannerLink href={ad.link} label="Зар">{image}</BannerLink> : image}
      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Зар</span>
    </aside>
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
  const ads = settings?.homepage.adBanners ?? [];
  // Хоёр эгнээ тутамд нэг зар. Эгнээнээс илүү гарсан зар хамгийн доор.
  return (
    <>
      <Hero />
      {error && <div className="mt-8"><ErrorState message={error} onRetry={reload} /></div>}
      {!loading && !error && data?.total === 0 && <div className="mt-8"><EmptyState title="Одоогоор кино нэмэгдээгүй байна">Удахгүй шинэ кинонууд нэмэгдэнэ.</EmptyState></div>}
      {sections.map((s, i) => (
        <Fragment key={s.key}>
          <SectionRow section={s} />
          {i % 2 === 1 && ads[(i - 1) / 2] && <AdStrip ad={ads[(i - 1) / 2]} />}
        </Fragment>
      ))}
      {ads.slice(Math.floor(sections.length / 2)).map((ad) => <AdStrip key={ad.image} ad={ad} />)}
    </>
  );
}
