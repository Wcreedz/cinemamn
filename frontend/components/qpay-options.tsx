'use client';
import { useState } from 'react';
import type { PaymentView } from '@mongolflix/shared';
import { Skeleton } from '@/components/ui/misc';
import { useIsMobile } from '@/hooks/use-is-mobile';

type Qr = NonNullable<PaymentView['qr']>;

function QrImage({ image }: { image: string }) {
  return <img src={`data:image/png;base64,${image}`} alt="QPay QR код" className="mx-auto size-60 rounded-lg bg-white p-2" />;
}

function BankApps({ urls }: { urls: Qr['urls'] }) {
  return (
    <ul className="grid grid-cols-4 gap-2" aria-label="Банкны апп">
      {urls.map((u) => (
        <li key={u.link}>
          <a href={u.link} className="flex h-full flex-col items-center gap-1.5 rounded-xl border bg-muted p-2 text-center transition-colors hover:bg-accent">
            {u.logo && <img src={u.logo} alt="" loading="lazy" className="size-10 rounded-xl" />}
            <span className="line-clamp-2 text-[10px] leading-tight">{u.description || u.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Гар утсан дээр банкны апп сонгоно, компьютер дээр утсаараа QR уншуулна.
export function QPayOptions({ qr }: { qr: Qr }) {
  const mobile = useIsMobile();
  const [showQr, setShowQr] = useState(false);
  const urls = qr.urls ?? [];

  if (mobile === null) return <Skeleton className="mx-auto size-60" />;

  if (mobile && urls.length > 0) {
    return (
      <div>
        <p className="mb-3 text-sm font-semibold">Төлөх банкны апп-аа сонгоно уу</p>
        <BankApps urls={urls} />
        {qr.image && (
          <div className="mt-4 text-center">
            <button type="button" aria-expanded={showQr} onClick={() => setShowQr(!showQr)} className="cursor-pointer text-xs text-muted-foreground underline">
              {showQr ? 'QR код нуух' : 'Өөр төхөөрөмжөөр уншуулах бол QR код харах'}
            </button>
            {showQr && <div className="mt-3"><QrImage image={qr.image} /></div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      {qr.image && <QrImage image={qr.image} />}
      <p className="mt-3 text-sm text-muted-foreground">Банкны апп-аараа QR кодыг уншуулж төлнө үү.</p>
      {!qr.image && qr.shortUrl && <a href={qr.shortUrl} className="mt-2 inline-block text-sm text-primary underline">Төлбөрийн холбоос нээх</a>}
    </div>
  );
}
