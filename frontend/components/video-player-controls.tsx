'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Shrink, Volume2, VolumeX } from 'lucide-react';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const SKIP_SECONDS = 10;
const HIDE_AFTER_MS = 3000;

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

function SkipIcon({ forward }: { forward?: boolean }) {
  const Icon = forward ? RotateCw : RotateCcw;
  return (
    <span className="relative flex size-11 items-center justify-center sm:size-14">
      <Icon className="size-full" strokeWidth={1.5} aria-hidden />
      <span className="absolute pt-0.5 text-[11px] font-bold sm:text-sm">{SKIP_SECONDS}</span>
    </span>
  );
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  levels: { index: number; height: number }[];
  level: number;
  onLevel: (level: number) => void;
  fill: boolean;
  onFill: () => void;
  top: React.ReactNode;
}

type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

export function VideoPlayerControls({ videoRef, containerRef, levels, level, onLevel, fill, onFill, top }: Props) {
  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [visible, setVisible] = useState(true);
  // Гүйлгэх мөрийг чирж байхад сегмент бүрийг татахгүй: суллахад л шилжинэ.
  const [dragging, setDragging] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setPaused(v.paused);
      setTime(v.currentTime);
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      setMuted(v.muted);
      setVolume(v.volume);
      setBuffered(v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0);
    };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const events = ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'progress', 'seeked', 'loadedmetadata', 'ended'];
    events.forEach((e) => v.addEventListener(e, sync));
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onPlaying);
    sync();
    return () => {
      events.forEach((e) => v.removeEventListener(e, sync));
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onPlaying);
    };
  }, [videoRef]);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setFullscreen(active);
      const orientation = screen.orientation as LockableOrientation | undefined;
      const v = videoRef.current;
      // Хэвтээ киног утсанд бүтэн дэлгэц болгоход шууд эргүүлнэ. Компьютер, iPhone үүнийг дэмждэггүй: тэнд татгалзал хэвийн.
      if (active && v && v.videoWidth > v.videoHeight) void orientation?.lock?.('landscape').catch(() => undefined);
      else if (!active) orientation?.unlock?.();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [containerRef, videoRef]);

  const wake = useCallback(() => {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  // Хулгана хөдөлгөхгүй ч кино эхэлмэгц удирдлага нуугдана.
  useEffect(() => { if (!paused) wake(); }, [paused, wake]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, [videoRef]);

  const skip = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + seconds));
    setTime(v.currentTime);
    wake();
  }, [videoRef, wake]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const box = containerRef.current;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (box?.requestFullscreen) void box.requestFullscreen().catch(() => undefined);
    // iPhone-ий Safari зөвхөн видеог өөрийнх нь тоглуулагчаар бүтэн дэлгэц болгодог.
    else v?.webkitEnterFullscreen?.();
  }, [containerRef, videoRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // Сонголт, гүйлгэх мөр сумаа, товч зайгаа өөрөө ашигладаг.
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => skip(-SKIP_SECONDS), ArrowRight: () => skip(SKIP_SECONDS),
        k: togglePlay, m: toggleMute, f: toggleFullscreen,
        ...(tag === 'BUTTON' || tag === 'A' ? {} : { ' ': togglePlay }),
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      action();
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip, togglePlay, toggleMute, toggleFullscreen, wake]);

  const commitSeek = () => {
    const v = videoRef.current;
    if (v && dragging !== null) { v.currentTime = dragging; setTime(dragging); }
    setDragging(null);
  };

  // Зогссон үед удирдлага нуугдахгүй.
  const shown = visible || paused;
  const position = dragging ?? time;
  const percent = (value: number) => (duration ? `${Math.min(100, (value / duration) * 100)}%` : '0%');
  const iconButton = 'flex cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white';

  return (
    <div
      data-testid="player-controls"
      className={cn('absolute inset-0 flex flex-col justify-end text-white', !shown && 'cursor-none')}
      onPointerMove={wake}
      // Утсанд эхний товшилт удирдлагыг гаргана, зөвхөн харагдаж байхад тоглуулах/зогсооно.
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!shown) wake();
        else togglePlay();
      }}
    >
      <div className={cn('absolute inset-x-0 top-0 transition-opacity', shown ? 'opacity-100' : 'pointer-events-none opacity-0')}>{top}</div>

      {waiting && <Loader2 className="pointer-events-none absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 animate-spin" aria-label="Ачаалж байна" />}

      <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center gap-6 transition-opacity sm:gap-12', shown ? 'opacity-100' : 'opacity-0')}>
        <button type="button" aria-label={`${SKIP_SECONDS} секунд ухраах`} tabIndex={shown ? 0 : -1} className={cn(iconButton, 'bg-black/50 p-2 hover:bg-black/70', shown && 'pointer-events-auto')} onClick={() => skip(-SKIP_SECONDS)}><SkipIcon /></button>
        <button type="button" aria-label={paused ? 'Тоглуулах' : 'Түр зогсоох'} tabIndex={shown ? 0 : -1} className={cn(iconButton, 'size-16 bg-black/50 sm:size-20', shown && 'pointer-events-auto', waiting && !paused && 'opacity-0')} onClick={() => { togglePlay(); wake(); }}>
          {paused ? <Play className="size-8 fill-current sm:size-10" aria-hidden /> : <Pause className="size-8 fill-current sm:size-10" aria-hidden />}
        </button>
        <button type="button" aria-label={`${SKIP_SECONDS} секунд урагшлуулах`} tabIndex={shown ? 0 : -1} className={cn(iconButton, 'bg-black/50 p-2 hover:bg-black/70', shown && 'pointer-events-auto')} onClick={() => skip(SKIP_SECONDS)}><SkipIcon forward /></button>
      </div>

      <div className={cn('relative space-y-1 bg-linear-to-t from-black/80 to-transparent px-3 pb-2 pt-8 transition-opacity sm:px-4', shown ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <div className="relative flex h-5 items-center">
          <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: percent(buffered) }} />
            <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: percent(position) }} />
          </div>
          <input
            type="range" aria-label="Гүйлгэх" min={0} max={duration || 0} step={1} value={Math.min(position, duration || 0)}
            aria-valuetext={`${clock(position)} / ${clock(duration)}`}
            className="relative h-5 w-full cursor-pointer touch-none appearance-none bg-transparent [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            onChange={(e) => setDragging(Number(e.target.value))} onPointerUp={commitSeek} onPointerCancel={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek}
          />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" aria-label={muted ? 'Дуу нээх' : 'Дуу хаах'} className={cn(iconButton, 'size-9')} onClick={toggleMute}>{muted || volume === 0 ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}</button>
          <input
            type="range" aria-label="Дууны хэмжээ" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            className="hidden h-1 w-20 cursor-pointer accent-white sm:block"
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              v.volume = Number(e.target.value);
              v.muted = v.volume === 0;
            }}
          />
          <span className="ml-1 whitespace-nowrap text-xs tabular-nums sm:text-sm">{clock(position)} / {clock(duration)}</span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {levels.length > 1 && (
              <Select aria-label="Чанар" className="h-8 w-auto border-white/30 bg-black/60 py-0 text-xs text-white" value={level} onChange={(e) => onLevel(Number(e.target.value))}>
                <option value={-1}>Автомат</option>
                {levels.map((l) => <option key={l.index} value={l.index}>{l.height}p</option>)}
              </Select>
            )}
            <button type="button" aria-pressed={fill} aria-label={fill ? 'Зургийг бүтнээр харуулах' : 'Дэлгэц дүүргэх'} title={fill ? 'Зургийг бүтнээр харуулах' : 'Дэлгэц дүүргэх'} className={cn(iconButton, 'size-9')} onClick={() => { onFill(); wake(); }}>{fill ? <Shrink className="size-5" aria-hidden /> : <Expand className="size-5" aria-hidden />}</button>
            <button type="button" aria-label={fullscreen ? 'Бүтэн дэлгэцээс гарах' : 'Бүтэн дэлгэц'} className={cn(iconButton, 'size-9')} onClick={toggleFullscreen}>{fullscreen ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
