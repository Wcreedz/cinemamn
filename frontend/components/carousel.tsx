'use client';
import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Carousel({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section aria-label={title} className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="hidden gap-1 md:flex">
          <button aria-label="Өмнөх" onClick={() => scroll(-1)} className="cursor-pointer rounded-full bg-muted p-1.5 hover:bg-accent"><ChevronLeft className="size-4" /></button>
          <button aria-label="Дараах" onClick={() => scroll(1)} className="cursor-pointer rounded-full bg-muted p-1.5 hover:bg-accent"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div ref={ref} className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 [&>*]:w-36 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-44">{children}</div>
    </section>
  );
}
