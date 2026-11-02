'use client';
import { useParams } from 'next/navigation';
import type { AdminMovie } from '@mongolflix/shared';
import { MovieForm } from '@/components/admin/movie-form';
import { PageHeader } from '@/components/admin/ui';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';

export default function EditMovie() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<AdminMovie>(`/api/admin/movies/${id}`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  return <><PageHeader title={data.title} subtitle="Кино засах" /><MovieForm movie={data} onChanged={() => void reload()} /></>;
}
