'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Clock, Crown, Film, Play, RefreshCw, Youtube } from 'lucide-react';
import type { MovieDetail, PaymentView, PlansResponse } from '@mongolflix/shared';
import { Poster } from '@/components/movie-card';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { authHref } from '@/lib/auth-entry';
import { accessLabel, canWatchMovie, date, money, movieAccessOf, runtime } from '@/lib/utils';

export default function MovieDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, access, settings } = useApp();
  const router = useRouter();
  const { data: m, error, errorCode, loading, reload } = useApi<MovieDetail>(`/api/movies/${slug}`);
  const gone = errorCode === 'NOT_FOUND';
  // Устгасан киноны хуучин холбоос: replace нь "буцах"-аар дахин энд ирүүлэхгүй.
  useEffect(() => { if (gone) router.replace('/'); }, [gone, router]);
  const plans = useApi<PlansResponse>('/api/subscriptions/plans');
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  // Зөвхөн киноны id илгээнэ: үнэ, хугацааг сервер киноны бичлэгээс тооцно.
  const buyMovie = async (movie: MovieDetail) => {
    setBuying(true); setBuyError(null);
    try {
      const p = await api<PaymentView>('/api/qpayGargaya', { body: { movieId: movie.id } });
      router.push(`/subscription/pay/${p.id}?next=${encodeURIComponent(`/movies/${movie.slug}`)}`);
    } catch (e) {
      setBuyError((e as Error).message);
      setBuying(false);
    }
  };
  if (loading || gone) return <Skeleton className="h-96" />;
  if (error || !m) return <ErrorState message={error ?? 'Кино олдсонгүй.'} onRetry={reload} />;
  const canWatch = canWatchMovie(m.id, { signedIn: !!user, access, settings });
  // Зөвхөн энэ киноны эрхээр үзэж байгаа бол дуусах огноо, сунгах товч харагдана.
  const own = !access?.hasAccess && settings?.subscription.paymentRequired !== false ? movieAccessOf(m.id, access) : null;
  const plan = plans.data?.enabled === false ? undefined : plans.data?.plans[0];
  const rental = m.rentalPrice ? { price: m.rentalPrice, days: m.rentalDays ?? 30, currency: plans.data?.currency ?? 'MNT' } : null;
  const comingSoon = m.videoStatus !== 'ready';
  return (
    <article>
      <div className="relative -mx-4 -mt-4 h-[40vh] overflow-hidden bg-muted md:h-[55vh]">
        {m.backdrop && <img src={m.backdrop} alt="" className="size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      </div>
      <div className="relative -mt-28 flex flex-col gap-6 md:-mt-40 md:flex-row">
        <Poster src={m.poster} title={m.title} className="aspect-[2/3] w-36 shrink-0 rounded-lg object-cover shadow-2xl md:w-60" />
        <div className="min-w-0 flex-1 md:pt-24">
          <h1 className="text-3xl font-black md:text-4xl">{m.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {m.adultOnly && <Badge tone="primary">18+</Badge>}
            {m.releaseYear && <span>{m.releaseYear}</span>}
            {m.duration ? <span>{runtime(m.duration)}</span> : null}
            {m.genres.map((g) => <Badge key={g.id}>{g.name}</Badge>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {comingSoon ? (
              <span className="inline-flex h-12 items-center gap-2 rounded-md bg-muted px-6 text-base font-semibold text-muted-foreground"><Clock className="size-4" />Тун удахгүй</span>
            ) : canWatch ? (
              <Button asChild size="lg"><Link href={`/watch/${m.slug}`}><Play />Кино үзэх</Link></Button>
            ) : !user ? (
              <Button asChild size="lg"><Link href={authHref('/register', `/movies/${m.slug}`)}><Crown />Нэвтэрч үзэх</Link></Button>
            ) : (
              <>
                <Button asChild size="lg"><Link href="/subscription"><Crown />Бүх киноны эрх авах</Link></Button>
                {rental && <Button size="lg" variant="outline" disabled={buying} onClick={() => void buyMovie(m)}><Film />{buying ? 'Үүсгэж байна…' : `Зөвхөн энэ кино · ${money(rental.price, rental.currency)}`}</Button>}
              </>
            )}
            {m.trailerUrl && <Button asChild size="lg" variant="secondary"><a href={m.trailerUrl} target="_blank" rel="noreferrer noopener"><Youtube />Трейлер</a></Button>}
          </div>
          {buyError && <Notice tone="danger" className="mt-4 max-w-lg">{buyError}</Notice>}
          {!comingSoon && !canWatch && (
            <Card className="mt-5 max-w-lg p-4">
              <p className="font-semibold">Энэ киног үзэхийн тулд эрх шаардлагатай.</p>
              {plan && <p className="mt-1 text-sm text-muted-foreground">{accessLabel(plan.durationDays)}: {money(plan.price, plan.currency)} / {plan.durationDays} хоног.</p>}
              {rental && <p className="mt-1 text-sm text-muted-foreground">Зөвхөн энэ кино: {money(rental.price, rental.currency)} / {rental.days} хоног.</p>}
            </Card>
          )}
          {!comingSoon && own && (
            <Card className="mt-5 flex max-w-lg flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">Энэ киноны эрх: {date(own.expiresAt)} хүртэл</p>
                {rental && <p className="text-sm text-muted-foreground">Сунгавал дуусах огнооноос {rental.days} хоног нэмэгдэнэ · {money(rental.price, rental.currency)}</p>}
              </div>
              {rental && <Button variant="outline" size="sm" disabled={buying} onClick={() => void buyMovie(m)}><RefreshCw />{buying ? 'Үүсгэж байна…' : 'Сунгах'}</Button>}
            </Card>
          )}
          {m.description && <p className="mt-6 max-w-3xl whitespace-pre-line leading-relaxed text-gray-300">{m.description}</p>}
          <dl className="mt-6 grid max-w-2xl grid-cols-[6rem_1fr] gap-y-2 text-sm">
            {m.director && <><dt className="text-muted-foreground">Найруулагч</dt><dd>{m.director}</dd></>}
            {m.cast.length > 0 && <><dt className="text-muted-foreground">Жүжигчид</dt><dd>{m.cast.join(', ')}</dd></>}
            {m.language && <><dt className="text-muted-foreground">Хэл</dt><dd>{m.language}</dd></>}
            {m.country && <><dt className="text-muted-foreground">Улс</dt><dd>{m.country}</dd></>}
          </dl>
        </div>
      </div>
    </article>
  );
}
