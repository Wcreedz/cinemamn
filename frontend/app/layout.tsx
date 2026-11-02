import type { Metadata, Viewport } from 'next';
import type { PublicSettings } from '@mongolflix/shared';
import { Providers } from '@/components/providers';
import './globals.css';

// Брэнд админ тохиргооноос ирнэ. API унтарсан үед л энгийн нэр харагдана.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://localhost:4100'}/api/settings/public`, { next: { revalidate: 60 } });
    if (res.ok) {
      const s = (await res.json()) as PublicSettings;
      return {
        title: { default: s.general.siteName, template: `%s | ${s.general.siteName}` },
        description: s.general.description,
        icons: s.general.favicon ? { icon: s.general.favicon } : undefined,
      };
    }
  } catch { /* build эсвэл API унтарсан үед */ }
  return { title: 'MongolFlix' };
}

export const viewport: Viewport = { themeColor: '#08090D', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body className="min-h-dvh"><Providers>{children}</Providers></body>
    </html>
  );
}
