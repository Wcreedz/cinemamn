'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeft } from 'lucide-react';
import type { MovieDetail, PlaybackGrant } from '@mongolflix/shared';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { ErrorState, Spinner } from '@/components/ui/misc';
import { api, ApiClientError } from '@/lib/api';

const PROGRESS_EVERY_MS = 15_000;

export default function WatchPage() {
  const { slug } = useParams<{ slug: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [ready, setReady] = useState(false);

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !movie || !v.duration || !Number.isFinite(v.duration)) return;
    void api(`/api/watch-history/${movie.id}`, { method: 'PUT', body: { progressSeconds: Math.floor(v.currentTime), durationSeconds: Math.floor(v.duration) } }).catch(() => undefined);
  }, [movie]);

  useEffect(() => {
    let cancelled = false;
    let refreshed = false;

    // Токен хугацаа нь дуусмагц сегмент 403 болно: шинэ токен авч байрлалаа хадгалан үргэлжилнэ.
    const start = async (m: MovieDetail, resumeAt?: number) => {
      const grant = await api<PlaybackGrant>(`/api/stream/${m.id}/token`, { method: 'POST' });
      if (cancelled || !videoRef.current) return;
      const video = videoRef.current;
      const seekTo = resumeAt ?? grant.resumeSeconds;
      hlsRef.current?.destroy();
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(data.levels.map((l, index) => ({ index, height: l.height })).sort((a, b) => b.height - a.height));
          if (seekTo) video.currentTime = seekTo;
          setReady(true);
          void video.play().catch(() => undefined);
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          const status = data.response?.code;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && status === 403 && !refreshed) {
            refreshed = true;
            void start(m, video.currentTime).catch((e) => setError({ message: (e as Error).message, code: (e as ApiClientError).code }));
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError({ message: status === 403 ? 'Тоглуулах эрх дууссан байна.' : 'Видео ачаалахад алдаа гарлаа.' });
          }
        });
        hls.loadSource(grant.manifestUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = grant.manifestUrl;
        video.addEventListener('loadedmetadata', () => { if (seekTo) video.currentTime = seekTo; setReady(true); }, { once: true });
      } else {
        setError({ message: 'Таны хөтөч видео тоглуулахыг дэмжихгүй байна.' });
      }
    };

    (async () => {
      const m = await api<MovieDetail>(`/api/movies/${slug}`);
      if (cancelled) return;
      setMovie(m);
      await start(m);
    })().catch((e) => setError({ message: (e as Error).message, code: (e as ApiClientError).code }));

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [slug]);

  useEffect(() => {
    const t = setInterval(saveProgress, PROGRESS_EVERY_MS);
    return () => { clearInterval(t); saveProgress(); };
  }, [saveProgress]);

  const changeLevel = (v: number) => {
    setLevel(v);
    if (hlsRef.current) hlsRef.current.currentLevel = v;
  };

  return (
    <main className="flex min-h-dvh flex-col bg-black">
      <div className="flex items-center gap-3 p-3">
        <Button asChild variant="ghost" size="icon" aria-label="Буцах"><Link href={movie ? `/movies/${movie.slug}` : '/movies'}><ArrowLeft /></Link></Button>
        <h1 className="line-clamp-1 flex-1 font-semibold">{movie?.title}</h1>
        {levels.length > 1 && (
          <Select aria-label="Чанар" className="w-auto" value={level} onChange={(e) => changeLevel(Number(e.target.value))}>
            <option value={-1}>Автомат</option>
            {levels.map((l) => <option key={l.index} value={l.index}>{l.height}p</option>)}
          </Select>
        )}
      </div>
      {error ? (
        <div className="m-auto max-w-md p-4">
          <ErrorState message={error.message} />
          {(error.code === 'SUBSCRIPTION_REQUIRED' || error.code === 'UNAUTHORIZED') && (
            <Button asChild className="mt-4 w-full"><Link href={error.code === 'UNAUTHORIZED' ? `/login?next=/watch/${slug}` : '/subscription'}>{error.code === 'UNAUTHORIZED' ? 'Нэвтрэх' : 'Эрх авах'}</Link></Button>
          )}
        </div>
      ) : (
        <div className="relative flex flex-1 items-center justify-center">
          {!ready && <Spinner className="absolute size-10" />}
          <video ref={videoRef} controls playsInline className="max-h-[calc(100dvh-4rem)] w-full" onPause={saveProgress} onEnded={saveProgress} controlsList="nodownload" />
        </div>
      )}
    </main>
  );
}
