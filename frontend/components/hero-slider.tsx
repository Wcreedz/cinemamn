'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTO_MS = 6000;
const SWIPE_PX = 40;

export function BannerLink({ href, label, className, children }: { href: string; label?: string; className?: string; children?: ReactNode }) {
  if (/^https?:\/\//.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={className}>{children}</a>;
  return <Link href={href} aria-label={label} className={className}>{children}</Link>;
}

export interface Slide { key: string; image?: string; title: string; text?: string; link?: string; actions?: ReactNode }

export function HeroSlider({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;
  // Админ слайд хассан бол хуучин дугаар хэтэрч болно.
  const active = count ? index % count : 0;
  const go = (next: number) => setIndex((next + count) % count);

  // index-ээс хамаарна: гараар шилжүүлэхэд дараагийн шилжилт дахин тоологдоно.
  useEffect(() => {
    if (count < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_MS);
    return () => clearInterval(t);
  }, [count, paused, index]);

  if (!count) return null;
  return (
    <section
      aria-roledescription="carousel" aria-label="Онцлох"
      className="relative -mx-4 h-72 overflow-hidden bg-muted md:mx-0 md:h-[60vh] md:min-h-80 md:rounded-xl"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null || count < 2) return;
        const moved = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(moved) > SWIPE_PX) go(active + (moved < 0 ? 1 : -1));
      }}
    >
      {slides.map((s, i) => (
        <div key={s.key} aria-hidden={i !== active} aria-roledescription="slide" className={cn('absolute inset-0 transition-[opacity,visibility] duration-700', i === active ? 'visible opacity-100' : 'invisible opacity-0')}>
          {s.image && <img src={s.image} alt={s.title} className="absolute inset-0 size-full object-cover" />}
          {(s.title || s.text) && <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />}
          {s.link && !s.title && !s.text && <BannerLink href={s.link} label="Дэлгэрэнгүй" className="absolute inset-0" />}
          {(s.title || s.text) && (
            <div className="absolute bottom-0 left-0 max-w-xl p-6 pb-10 md:p-10">
              {s.title && <h1 className="text-3xl font-black md:text-5xl">{s.title}</h1>}
              {s.text && <p className="mt-3 line-clamp-2 text-sm md:line-clamp-3 text-gray-300 md:text-base">{s.text}</p>}
              {s.actions}
            </div>
          )}
        </div>
      ))}
      {count > 1 && (
        <>
          <button aria-label="Өмнөх слайд" onClick={() => go(active - 1)} className="absolute left-3 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-full bg-black/50 p-2 text-white hover:bg-black/75 md:block"><ChevronLeft className="size-5" /></button>
          <button aria-label="Дараах слайд" onClick={() => go(active + 1)} className="absolute right-3 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-full bg-black/50 p-2 text-white hover:bg-black/75 md:block"><ChevronRight className="size-5" /></button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center">
            {slides.map((s, i) => (
              <button key={s.key} aria-label={`${i + 1}-р слайд`} aria-current={i === active} onClick={() => go(i)} className="cursor-pointer p-2">
                <span className={cn('block size-2 rounded-full', i === active ? 'bg-white' : 'bg-white/40')} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
