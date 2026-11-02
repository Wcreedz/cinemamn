'use client';
import Link from 'next/link';
import { useApp } from '@/components/providers';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { settings } = useApp();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-2xl font-black text-primary">{settings?.general.siteName ?? 'MongolFlix'}</Link>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6">
        <h1 className="mb-5 text-xl font-black">{title}</h1>
        {children}
      </div>
    </main>
  );
}
