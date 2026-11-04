'use client';
import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Pagination, type Paging } from '@/components/ui/pagination';
import { usePagination, type Pager } from '@/hooks/use-pagination';
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
// Бүх жагсаалт энд дугаарлагдаж, хуудаслагдана. paging өгөөгүй бол серверээс бүгдээрээ ирсэн мөрүүдийг энд хуваана.
export function Table({ head, paging, pager, children }: { head: ReactNode[]; paging?: Paging; pager?: Pager; children: ReactNode }) {
  const rows = Children.toArray(children);
  const local = usePagination();
  const limit = paging?.limit ?? local.limit;
  const pages = paging?.pages ?? Math.ceil(rows.length / limit);
  // Мөр устаж хуудас багассан бол хоосон хуудас үлдэхгүй.
  const page = paging?.page ?? Math.min(local.page, Math.max(pages, 1));
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
      <Pagination paging={{ page, limit, pages, total: paging?.total ?? rows.length }} pager={paging && pager ? pager : local} />
    </>
  );
}
