'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApp } from '@/components/providers';
import { Skeleton } from '@/components/ui/misc';

export function AuthGate({ children, next }: { children: React.ReactNode; next: string }) {
  const { user, loading } = useApp();
  const router = useRouter();
  const path = usePathname();
  const denied = !loading && !user;
  useEffect(() => {
    if (denied) router.replace(`/login?next=${encodeURIComponent(path.startsWith(next) ? path : next)}`);
  }, [denied, next, path, router]);
  if (loading || denied) return <Skeleton className="h-64" />;
  return <>{children}</>;
}
