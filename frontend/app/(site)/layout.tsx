'use client';
import { SiteNav } from '@/components/site-nav';
import { useApp } from '@/components/providers';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const { settings, user } = useApp();
  const maintenance = settings?.general.maintenanceMode && user?.role === 'user';
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 lg:pb-12">
        {maintenance ? <p className="py-24 text-center text-lg font-semibold">Сайт засвартай байна. Удахгүй эргэн ирнэ.</p> : children}
      </main>
    </>
  );
}
