'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, CreditCard, Crown, Film, Globe, History, LayoutGrid, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

const GROUPS = [
  { title: 'Ерөнхий', items: [
    { href: '/admin', label: 'Хянах самбар', icon: BarChart3 },
    { href: '/admin/users', label: 'Хэрэглэгчид', icon: Users },
    { href: '/admin/movies', label: 'Кино', icon: Film },
    { href: '/admin/categories', label: 'Ангилал', icon: LayoutGrid },
  ] },
  { title: 'Төлбөр', items: [
    { href: '/admin/payments', label: 'Төлбөрүүд', icon: CreditCard },
    { href: '/admin/subscriptions', label: 'Эрхүүд', icon: Crown },
  ] },
  { title: 'Систем', items: [
    { href: '/admin/settings', label: 'Тохиргоо', icon: Settings },
    { href: '/admin/logs', label: 'Үйлдлийн түүх', icon: History },
  ] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, loading, settings, logout } = useApp();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  const isLogin = path === '/admin/login';
  // Энэ нь зөвхөн UX: бодит хамгаалалт backend-ийн requireAdmin дээр байна.
  const denied = !loading && (!user || user.role === 'user');
  useEffect(() => {
    if (denied && !isLogin) router.replace('/admin/login');
  }, [denied, isLogin, router]);

  // Нэвтрэх хуудас нь цэс, эрхийн шалгалтгүй, зөвхөн theme-ийг өвлөнө.
  if (isLogin) return <div className="admin-theme bg-background text-foreground">{children}</div>;
  // Эрхгүй хүнд цэс огт харагдахгүй.
  if (loading || denied) return <div className="admin-theme flex min-h-dvh items-center justify-center bg-background text-foreground"><Spinner className="size-8" /></div>;

  return (
    <div className="admin-theme min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card px-4">
        <button aria-label={open ? 'Цэс хаах' : 'Цэс нээх'} className="cursor-pointer lg:hidden" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        <Link href="/admin" className="text-xl font-black text-primary">{settings?.general.siteName ?? 'MongolFlix'} <span className="text-xs font-semibold uppercase text-muted-foreground">Админ</span></Link>
        <div className="ml-auto flex items-center gap-2">
          {user && (
            <div className="hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-sm sm:flex">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              <span className="max-w-64 truncate font-semibold">{user.email ?? user.phone}</span>
              <span className="text-xs text-muted-foreground">{user.role}</span>
            </div>
          )}
          <Button asChild variant="outline" size="sm"><Link href="/" aria-label="Сайт руу очих"><Globe /><span className="hidden sm:inline">Сайт руу очих</span></Link></Button>
          {user && (
            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-white" aria-label="Гарах" onClick={() => void logout().then(() => router.push('/admin/login'))}>
              <LogOut /><span className="hidden sm:inline">Гарах</span>
            </Button>
          )}
        </div>
      </header>
      <div className="flex">
        <aside className={cn('fixed inset-y-16 left-0 z-20 w-64 overflow-y-auto border-r bg-card p-4 transition-transform lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
          <nav aria-label="Админ цэс" className="space-y-6">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70">{g.title}</p>
                <ul className="space-y-1">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} onClick={() => setOpen(false)} aria-current={active(i.href) ? 'page' : undefined}
                        className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', active(i.href) && 'bg-accent text-primary')}>
                        <i.icon className="size-5" />{i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
