'use client';
import { useState } from 'react';
import type { Paginated } from '@mongolflix/shared';
import { AdminsTab, AllSettings, GeneralTab, HomepageTab, PaymentTab, SecurityTab, SubscriptionTab, VideoTab } from '@/components/admin/settings-tabs';
import { LogTable, type LogRow } from '@/components/admin/log-table';
import { PageHeader } from '@/components/admin/ui';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';

const TABS = [
  ['general', 'Ерөнхий'], ['subscription', 'Эрхийн багц'], ['payment', 'Төлбөр'],
  ['video', 'Видео'], ['homepage', 'Нүүр хуудас'], ['security', 'Аюулгүй байдал'], ['admins', 'Админ удирдлага'], ['history', 'Өөрчлөлтийн түүх'],
] as const;

function History() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi<Paginated<LogRow>>(`/api/admin/settings/history?page=${page}`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <LogTable data={data ?? undefined} onPage={setPage} />;
}

export default function AdminSettingsPage() {
  const { data, error, reload } = useApi<AllSettings>('/api/admin/settings');
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader title="Тохиргоо" subtitle="Системийн бүх тохиргоог эндээс удирдана" />
      <Tabs defaultValue="general">
        <TabsList className="mb-6 rounded-xl border bg-card p-1.5">
          {TABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="general"><GeneralTab entry={data.general} reload={reload} /></TabsContent>
        <TabsContent value="subscription"><SubscriptionTab entry={data.subscription} reload={reload} /></TabsContent>
        <TabsContent value="payment"><PaymentTab entry={data.subscription} reload={reload} /></TabsContent>
        <TabsContent value="video"><VideoTab entry={data.video} roots={data.videoAllowedRoots} reload={reload} /></TabsContent>
        <TabsContent value="homepage"><HomepageTab entry={data.homepage} reload={reload} /></TabsContent>
        <TabsContent value="security"><SecurityTab entry={data.security} reload={reload} /></TabsContent>
        <TabsContent value="admins"><AdminsTab /></TabsContent>
        <TabsContent value="history"><History /></TabsContent>
      </Tabs>
    </>
  );
}
