'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeft } from 'lucide-react';
import type { MovieDetail, PlaybackGrant } from '@mongolflix/shared';
import { Button } from '@/components/ui/button';
import { ErrorState, Spinner } from '@/components/ui/misc';
import { VideoPlayerControls } from '@/components/video-player-controls';
import { api, ApiClientError } from '@/lib/api';

const PROGRESS_EVERY_MS = 15_000;
const FILL_KEY = 'mf_player_fill';

export default function WatchPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [ready, setReady] = useState(false);
  const [fill, setFill] = useState(false);
  // Хуудаснаас гарах үед видео аль хэдийн салгагдсан байдаг: сүүлийн байрлалыг тусад нь хадгална.
  const position = useRef({ time: 0, duration: 0 });

  useEffect(() => {
    try { setFill(localStorage.getItem(FILL_KEY) === '1'); } catch { /* хадгалах боломжгүй хөтөч: анхны горимоор */ }
  }, []);
  const toggleFill = () => {
    const next = !fill;
    setFill(next);
    try { localStorage.setItem(FILL_KEY, next ? '1' : '0'); } catch { /* зөвхөн энэ удаад хүчинтэй */ }
  };

  const saveProgress = useCallback(() => {
    const { time, duration } = position.current;
    if (!movie || !duration) return;
    void api(`/api/watch-history/${movie.id}`, { method: 'PUT', body: { progressSeconds: Math.floor(time), durationSeconds: Math.floor(duration) } }).catch(() => undefined);
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
    // Утсанд таб хаагдах, өөр апп руу шилжихэд хуудас дахин сэрэхгүй байж болно.
    const onHide = () => { if (document.visibilityState === 'hidden') saveProgress(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onHide); saveProgress(); };
  }, [saveProgress]);

  // Устгасан киноны хуучин холбоос: replace нь "буцах"-аар дахин энд ирүүлэхгүй.
  const gone = error?.code === 'NOT_FOUND';
  useEffect(() => { if (gone) router.replace('/'); }, [gone, router]);

  const changeLevel = (v: number) => {
    setLevel(v);
    if (hlsRef.current) hlsRef.current.currentLevel = v;
  };

  // replace: "буцах" дарсны дараа хөтчийн буцах товч киног дахин эхлүүлэхгүй.
  const titleBar = (
    <div className="flex items-center gap-3 bg-linear-to-b from-black/70 to-transparent p-3 text-white">
      <Button asChild variant="ghost" size="icon" aria-label="Буцах"><Link replace href={movie ? `/movies/${movie.slug}` : '/'}><ArrowLeft /></Link></Button>
      <h1 className="line-clamp-1 flex-1 font-semibold">{movie?.title}</h1>
    </div>
  );

  if (gone) return <main className="flex min-h-dvh items-center justify-center bg-black"><Spinner className="size-10" /></main>;
  return (
    <main className="relative h-dvh overflow-hidden bg-black">
      {error ? (
        <>
          {titleBar}
          <div className="mx-auto max-w-md p-4">
            <ErrorState message={error.message} />
            {(error.code === 'SUBSCRIPTION_REQUIRED' || error.code === 'UNAUTHORIZED') && (
              <Button asChild className="mt-4 w-full"><Link href={error.code === 'UNAUTHORIZED' ? `/login?next=/watch/${slug}` : '/subscription'}>{error.code === 'UNAUTHORIZED' ? 'Нэвтрэх' : 'Эрх авах'}</Link></Button>
            )}
          </div>
        </>
      ) : (
        <div ref={playerRef} className="absolute inset-0 flex items-center justify-center bg-black">
          {!ready && <Spinner className="absolute size-10" />}
          <video
            ref={videoRef} playsInline
            className={`absolute inset-0 size-full ${fill ? 'object-cover' : 'object-contain'}`}
            onTimeUpdate={(e) => { const v = e.currentTarget; if (Number.isFinite(v.duration) && v.duration > 0) position.current = { time: v.currentTime, duration: v.duration }; }}
            onPause={saveProgress} onEnded={saveProgress}
          />
          {ready ? <VideoPlayerControls videoRef={videoRef} containerRef={playerRef} levels={levels} level={level} onLevel={changeLevel} fill={fill} onFill={toggleFill} top={titleBar} /> : <div className="absolute inset-x-0 top-0">{titleBar}</div>}
        </div>
      )}
    </main>
  );
}
