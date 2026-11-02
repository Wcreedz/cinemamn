'use client';
import { MovieForm } from '@/components/admin/movie-form';
import { PageHeader } from '@/components/admin/ui';

export default function NewMovie() {
  return <><PageHeader title="Кино нэмэх" /><MovieForm /></>;
}
