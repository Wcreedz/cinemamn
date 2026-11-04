'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES, type Pager } from '@/hooks/use-pagination';
import { cn } from '@/lib/utils';

export interface Paging { page: number; limit: number; pages: number; total: number }

// 1 … 4 5 6 … 12
function pageNumbers(page: number, pages: number) {
  const wanted = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return wanted.flatMap((p, i) => (i > 0 && p - wanted[i - 1] > 1 ? [null, p] : [p]));
}

function PageSize({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Хуудасны хэмжээ"
        onClick={() => setOpen(!open)}
        className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {value} / хуудас<ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        // Хуудаслалт жагсаалтын доор байдаг тул дээшээ нээгдэж дэлгэцээс гарахгүй.
        <div role="listbox" aria-label="Хуудасны хэмжээ" className="absolute bottom-full right-0 z-20 mb-1 min-w-full rounded-lg border bg-card p-1 shadow-lg">
          {PAGE_SIZES.map((size) => (
            <button
              key={size} type="button" role="option" aria-selected={size === value}
              onClick={() => { setOpen(false); if (size !== value) onChange(size); }}
              className={cn('block w-full cursor-pointer whitespace-nowrap rounded-md px-3 py-2 text-left text-sm hover:bg-accent', size === value && 'bg-accent font-semibold text-primary')}
            >
              {size} / хуудас
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Сайт, админы бүх жагсаалт энэ нэг хуудаслалтыг ашиглана.
export function Pagination({ paging, pager, className }: { paging: Paging; pager: Pager; className?: string }) {
  const { page, limit, total } = paging;
  const pages = Math.max(paging.pages, 1);
  const arrow = 'flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40';
  return (
    <nav aria-label="Хуудаслалт" className={cn('mt-4 flex flex-wrap items-center justify-end gap-x-2 gap-y-2 text-sm', className)}>
      <span className="mr-auto text-muted-foreground">Нийт {total}</span>
      {/* Нарийн дэлгэцэд сум, дугаарууд салахгүй нэг мөрөөр шилжинэ. */}
      <div className="flex items-center gap-1">
      <button type="button" aria-label="Өмнөх хуудас" className={arrow} disabled={page <= 1} onClick={() => pager.setPage(page - 1)}><ChevronLeft className="size-4" /></button>
      {pageNumbers(page, pages).map((p, i) => (p === null
        ? <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
        : (
          <button
            type="button" key={p} aria-current={p === page ? 'page' : undefined} onClick={() => pager.setPage(p)}
            className={cn('h-8 min-w-8 cursor-pointer rounded-md px-2 text-xs font-semibold', p === page ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >
            {p}
          </button>
        )))}
      <button type="button" aria-label="Дараах хуудас" className={arrow} disabled={page >= pages} onClick={() => pager.setPage(page + 1)}><ChevronRight className="size-4" /></button>
      </div>
      <PageSize value={limit} onChange={pager.setLimit} />
    </nav>
  );
}
