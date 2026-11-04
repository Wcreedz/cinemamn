'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Category, MovieSummary, Paginated } from '@mongolflix/shared';
import { MovieGrid, MovieGridSkeleton } from '@/components/movie-card';
import { useApp } from '@/components/providers';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';

function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const banner = useApp().settings?.general.banner;
  const category = params.get('category') ?? '';
  const [sort, setSort] = useState('new');
  const pager = usePagination();
  const { setPage } = pager;
  const cats = useApi<{ items: Category[] }>('/api/categories');
  const { data, error, loading, reload } = useApi<Paginated<MovieSummary>>(`/api/movies?${pager.query}&sort=${sort}${category ? `&category=${category}` : ''}`);
  return (
    <>
      {/* Дэлгэцийн өргөнөөр сунах зурвас: гүйлгэх мөрийн өргөн нэмэгдэхийг layout-ын overflow-x-clip хаана. */}
      <div className="-mt-4 mb-5 border-b bg-linear-to-r from-transparent via-primary/20 to-transparent mx-[calc(50%-50vw)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-6">
            <h1 className="shrink-0 border-l-4 border-primary pl-3 text-xl font-bold">Кино</h1>
            {/* screen: зургийн хар дэвсгэр зурвасын өнгөнд уусаж, зөвхөн бичиг нь үлдэнэ. Бараан дэвсгэр дээр бусад зураг бараг өөрчлөгдөхгүй. */}
            {banner && <img src={banner} alt="Баннер" className="h-auto max-h-14 w-auto min-w-0 max-w-full object-contain mix-blend-screen" />}
          </div>
          {/* Өргөнийг сонголтын текстээс бус байрлалаас тогтооно: нарийн дэлгэцэд тэнцүү хоёр багана, өргөн дэлгэцэд тогтмол өргөн. */}
          <div className="flex w-full gap-3 lg:w-auto">
            <Select aria-label="Ангилал" className="flex-1 lg:w-44 lg:flex-none" value={category} onChange={(e) => { setPage(1); router.push(e.target.value ? `/?category=${e.target.value}` : '/'); }}>
              <option value="">Бүх ангилал</option>
              {cats.data?.items.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </Select>
            <Select aria-label="Эрэмбэ" className="flex-1 lg:w-44 lg:flex-none" value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
              <option value="new">Шинэ нь эхэндээ</option>
              <option value="popular">Түгээмэл</option>
              <option value="title">Нэрээр</option>
            </Select>
          </div>
        </div>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <MovieGridSkeleton /> : !data?.items.length ? <EmptyState title="Кино олдсонгүй" /> : (
        <>
          <MovieGrid movies={data.items} />
          <Pagination paging={data} pager={pager} className="mt-6" />
        </>
      )}
    </>
  );
}
export default function HomePage() {
  return <Suspense fallback={<MovieGridSkeleton />}><Catalog /></Suspense>;
}
