'use client';
import { useState } from 'react';
import type { Paginated } from '@mongolflix/shared';
import { LogTable, type LogRow } from '@/components/admin/log-table';
import { PageHeader, Pager } from '@/components/admin/ui';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paginated<LogRow>>(`/api/admin/logs?page=${page}`);
  return (
    <>
      <PageHeader title="Үйлдлийн түүх" subtitle="Админы бүх үйлдэл" />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : <><LogTable items={data?.items ?? []} /><Pager page={page} pages={data?.pages ?? 1} onPage={setPage} /></>}
    </>
  );
}
