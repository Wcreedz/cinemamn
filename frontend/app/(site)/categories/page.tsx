'use client';
import Link from 'next/link';
import type { Category } from '@mongolflix/shared';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

export default function CategoriesPage() {
  const { data, error, loading, reload } = useApi<{ items: Category[] }>('/api/categories');
  return (
    <>
      <h1 className="mb-5 text-2xl font-black">Ангилал</h1>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !data?.items.length ? <EmptyState title="Ангилал нэмэгдээгүй байна" /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.items.map((c) => (
            <Link key={c.id} href={`/movies?category=${c.slug}`} className="relative flex h-24 items-end overflow-hidden rounded-lg bg-gradient-to-br from-accent to-muted p-3 font-bold transition-transform hover:-translate-y-0.5">
              {c.image && <img src={c.image} alt="" className="absolute inset-0 size-full object-cover opacity-50" />}
              <span className="relative">{c.name}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
