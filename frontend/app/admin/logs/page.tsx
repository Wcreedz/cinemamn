'use client';
import type { Paginated } from '@mongolflix/shared';
import { LogTable, type LogRow } from '@/components/admin/log-table';
import { PageHeader } from '@/components/admin/ui';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { usePagination } from '@/hooks/use-pagination';

export default function AdminLogs() {
  const pager = usePagination();
  const { data, error, loading, reload } = useApi<Paginated<LogRow>>(`/api/admin/logs?${pager.query}`);
  return (
    <>
      <PageHeader title="Үйлдлийн түүх" subtitle="Админы бүх үйлдэл" />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : <LogTable data={data ?? undefined} pager={pager} />}
    </>
  );
}
