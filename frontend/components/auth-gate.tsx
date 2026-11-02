'use client';
import Link from 'next/link';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

export function AuthGate({ children, next }: { children: React.ReactNode; next: string }) {
  const { user, loading } = useApp();
  if (loading) return <Skeleton className="h-64" />;
  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 font-semibold">Энэ хуудсыг харахын тулд нэвтэрнэ үү.</p>
        <Button asChild><Link href={`/login?next=${encodeURIComponent(next)}`}>Нэвтрэх</Link></Button>
      </div>
    );
  }
  return <>{children}</>;
}
