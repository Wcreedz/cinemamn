'use client';
import type { ReactNode } from 'react';
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
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{head.map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button className="cursor-pointer rounded-md border px-3 py-1 disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>Өмнөх</button>
      <span className="text-muted-foreground">{page} / {pages}</span>
      <button className="cursor-pointer rounded-md border px-3 py-1 disabled:opacity-50" disabled={page >= pages} onClick={() => onPage(page + 1)}>Дараах</button>
    </div>
  );
}
