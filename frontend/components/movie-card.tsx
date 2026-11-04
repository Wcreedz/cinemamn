'use client';
import Link from 'next/link';
import { Clock, Film, Lock, Play } from 'lucide-react';
import type { MovieSummary } from '@mongolflix/shared';
import { useApp } from '@/components/providers';
import { Skeleton } from '@/components/ui/misc';
import { runtime } from '@/lib/utils';

export function Poster({ src, title, className }: { src?: string; title: string; className?: string }) {
  return src
    ? <img src={src} alt={title} loading="lazy" className={className} />
    : <div className={`${className} flex items-center justify-center bg-gradient-to-br from-accent to-muted`} role="img" aria-label={title}><Film className="size-10 text-muted-foreground" /></div>;
}

// resume: дуусаагүй киног дэлгэрэнгүй хуудас алгасан шууд тоглуулагч руу нээж, зогссон газраас нь үргэлжлүүлнэ.
export function MovieCard({ movie, progress, resume, note }: { movie: MovieSummary; progress?: number; resume?: boolean; note?: string }) {
  const { access, settings } = useApp();
  const locked = settings?.subscription.paymentRequired !== false && !access?.hasAccess;
  // Хуучин API талбаргүй хариу өгсөн ч бэлэн киног "удахгүй" гэж харуулахгүй: зөвхөн тодорхой false.
  const comingSoon = movie.playable === false;
  const canResume = resume && !comingSoon && !locked;
  const meta = [movie.releaseYear, movie.genres[0]?.name, runtime(movie.duration)].filter(Boolean).join(' · ');
  return (
    <Link href={canResume ? `/watch/${movie.slug}` : `/movies/${movie.slug}`} className="group block w-full">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        <Poster src={movie.poster} title={movie.title} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        {movie.adultOnly && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">18+</span>}
        {comingSoon ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white"><Clock className="size-3" />Тун удахгүй</span>
        ) : (
          <>
            <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/85 via-transparent to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white"><Play className="size-3.5" />{canResume ? 'Үргэлжлүүлэх' : 'Үзэх'}</span>
            </div>
            {locked && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white"><Lock className="size-3" />Эрх шаардлагатай</span>}
          </>
        )}
        {progress !== undefined && <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-primary" style={{ width: `${Math.min(progress * 100, 100)}%` }} /></div>}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold">{movie.title}</p>
      {(note ?? meta) && <p className="line-clamp-1 text-xs text-muted-foreground">{note ?? meta}</p>}
    </Link>
  );
}

export function MovieGridSkeleton({ count = 12 }: { count?: number }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{Array.from({ length: count }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}</div>;
}
export function MovieGrid({ movies }: { movies: MovieSummary[] }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{movies.map((m) => <MovieCard key={m.id} movie={m} />)}</div>;
}
