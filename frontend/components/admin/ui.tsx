'use client';
import { Children, cloneElement, isValidElement, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border bg-card p-6 shadow-[0_8px_30px_rgba(79,70,229,0.04)]', className)}>{children}</section>;
}
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  // Label нь input-ээ ороож байгаа тул id-гүйгээр ч холбогдоно.
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function NumberInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange: (n: number) => void }) {
  return <Input type="number" value={Number.isNaN(value) ? '' : value} onChange={(e) => onChange(e.target.valueAsNumber)} {...props} />;
}
interface Paging { page: number; limit: number; pages: number; total: number }

const LOCAL_PAGE_SIZE = 20;

// 1 … 4 5 6 … 12
function pageNumbers(page: number, pages: number) {
  const wanted = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return wanted.flatMap((p, i) => (i > 0 && p - wanted[i - 1] > 1 ? [null, p] : [p]));
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const button = 'h-8 min-w-8 cursor-pointer rounded-md border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:pointer-events-none disabled:opacity-50';
  return (
    <nav aria-label="Хуудаслалт" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">Нийт {total}</span>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>Өмнөх</button>
        {pageNumbers(page, Math.max(pages, 1)).map((p, i) => (p === null
          ? <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
          : <button type="button" key={p} aria-current={p === page ? 'page' : undefined} className={cn(button, p === page && 'border-primary bg-accent text-primary')} onClick={() => onPage(p)}>{p}</button>))}
        <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>Дараах</button>
      </div>
    </nav>
  );
}

// Бүх жагсаалт энд дугаарлагдаж, хуудаслагдана. paging өгөөгүй бол серверээс бүгдээрээ ирсэн мөрүүдийг энд хуваана.
export function Table({ head, paging, onPage, children }: { head: ReactNode[]; paging?: Paging; onPage?: (p: number) => void; children: ReactNode }) {
  const rows = Children.toArray(children);
  const [localPage, setLocalPage] = useState(1);
  const limit = paging?.limit ?? LOCAL_PAGE_SIZE;
  const pages = paging?.pages ?? Math.ceil(rows.length / limit);
  // Мөр устаж хуудас багассан бол хоосон хуудас үлдэхгүй.
  const page = paging?.page ?? Math.min(localPage, Math.max(pages, 1));
  const first = (page - 1) * limit;
  const shown = paging ? rows : rows.slice(first, first + limit);
  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{['№', ...head].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {shown.map((row, i) => (isValidElement<{ children?: ReactNode }>(row)
              ? cloneElement(row, undefined, <td key="number" className="w-12 px-4 py-3 tabular-nums text-muted-foreground">{first + i + 1}</td>, ...Children.toArray(row.props.children))
              : row))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={paging?.total ?? rows.length} onPage={paging ? (onPage ?? (() => undefined)) : setLocalPage} />
    </>
  );
}
