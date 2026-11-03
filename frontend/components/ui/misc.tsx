import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground', className)} {...props} />;
}
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
const TONES = { neutral: 'bg-muted text-muted-foreground', success: 'bg-success/15 text-success', warning: 'bg-warning/15 text-warning', danger: 'bg-destructive/15 text-destructive', primary: 'bg-primary/15 text-primary' };
export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', TONES[tone], className)} {...props} />;
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
      <Inbox className="size-8 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry && <button onClick={onRetry} className="cursor-pointer text-sm font-semibold text-primary underline">Дахин оролдох</button>}
    </div>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin', className)} aria-label="Ачаалж байна" />;
}
// Хэрэглэгч заавал анзаарах ёстой үр дүн: том, дүрстэй, гарчигтай.
export function Banner({ tone, title, children, className }: { tone: 'success' | 'danger' | 'warning' | 'neutral'; title: string; children?: ReactNode; className?: string }) {
  const { box, icon: Icon, color } = {
    success: { box: 'border-success/50 bg-success/10', icon: CheckCircle2, color: 'text-success' },
    danger: { box: 'border-destructive/50 bg-destructive/10', icon: AlertTriangle, color: 'text-destructive' },
    warning: { box: 'border-warning/50 bg-warning/10', icon: AlertTriangle, color: 'text-warning' },
    neutral: { box: 'border-border bg-muted', icon: Info, color: 'text-muted-foreground' },
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border-2 px-4 py-3', box, className)}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', color)} aria-hidden />
      <div className="min-w-0 break-words">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-0.5 text-sm">{children}</div>}
      </div>
    </div>
  );
}

export function Notice({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'success' | 'danger' | 'warning'; children: ReactNode; className?: string }) {
  const c = { neutral: 'border-border bg-muted', success: 'border-success/40 bg-success/10', danger: 'border-destructive/40 bg-destructive/10', warning: 'border-warning/40 bg-warning/10' }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-sm', c, className)}>{children}</div>;
}
