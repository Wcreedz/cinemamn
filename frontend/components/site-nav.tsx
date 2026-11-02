'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Clapperboard, Crown, Film, Home, LayoutGrid, LogOut, Search, Shield, User } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Нүүр', icon: Home },
  { href: '/movies', label: 'Кино', icon: Film },
  { href: '/categories', label: 'Ангилал', icon: LayoutGrid },
  { href: '/my-movies', label: 'Миний кино', icon: Clapperboard },
  { href: '/subscription', label: 'Миний эрх', icon: Crown },
  { href: '/profile', label: 'Профайл', icon: User },
];

export function SiteNav() {
  const path = usePathname();
  const router = useRouter();
  const { user, loading, settings, logout } = useApp();
  const [q, setQ] = useState('');
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const siteName = settings?.general.siteName ?? 'MongolFlix';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-black tracking-tight text-primary">
            {settings?.general.logo ? <img src={settings.general.logo} alt={siteName} className="h-8" /> : siteName}
          </Link>
          <nav aria-label="Үндсэн цэс" className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}
                className={cn('rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', isActive(l.href) && 'text-foreground')}>
                {l.label}
              </Link>
            ))}
          </nav>
          <form role="search" className="ml-auto flex min-w-0 max-w-xs flex-1 justify-end" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Кино хайх" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Хайх…" className="h-9 w-full rounded-full border bg-muted pl-9 pr-3 text-sm placeholder:text-muted-foreground" />
            </div>
          </form>
          {!loading && (user ? (
            <div className="flex shrink-0 items-center gap-1">
              {user.role !== 'user' && <Button asChild variant="ghost" size="icon" aria-label="Админ"><Link href="/admin"><Shield /></Link></Button>}
              <Button variant="ghost" size="icon" aria-label="Гарах" onClick={() => void logout().then(() => router.push('/'))}><LogOut /></Button>
            </div>
          ) : (
            <Button asChild size="sm" className="shrink-0"><Link href="/login">Нэвтрэх</Link></Button>
          ))}
        </div>
      </header>
      <nav aria-label="Гар утасны цэс" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground', isActive(l.href) && 'text-primary')}>
            <l.icon className="size-5" />{l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
