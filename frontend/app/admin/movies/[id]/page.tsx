'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import type { AdminMovie } from '@mongolflix/shared';
import { MovieForm } from '@/components/admin/movie-form';
import { PageHeader } from '@/components/admin/ui';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

const POLL_MS = 5000;

export default function EditMovie() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<AdminMovie>(`/api/admin/movies/${id}`);
  const status = data?.videoStatus;

  // Worker дуусахад хуудсаа шинэчлэхгүйгээр төлөв солигдоно.
  useEffect(() => {
    if (status !== 'queued' && status !== 'processing') return;
    const t = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(t);
  }, [status, reload]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  return <><PageHeader title={data.title} subtitle="Кино засах" /><MovieForm movie={data} onChanged={() => void reload()} /></>;
}
