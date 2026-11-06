'use client';
import { useSyncExternalStore } from 'react';
import type { PaymentView } from '@mongolflix/shared';
import { Building2, QrCode } from 'lucide-react';
import { Card, Notice } from '@/components/ui/misc';
import { isAndroidUserAgent, isInAppBrowserUserAgent, toBankAppLink } from '@/lib/bank-deeplink';

const noopSubscribe = () => () => undefined;
// Сервер дээр UA мэдэгдэхгүй тул false; клиент дээр бодит утга (hydration зөрөхгүй).
function useUserAgentFlag(test: (ua: string) => boolean) {
  return useSyncExternalStore(noopSubscribe, () => test(navigator.userAgent), () => false);
}

// Жижиг дэлгэцэд банкны апп-ууд, том дэлгэцэд QR код.
export function QPayOptions({ qr, amount }: { qr: NonNullable<PaymentView['qr']>; amount: string }) {
  const isAndroid = useUserAgentFlag(isAndroidUserAgent);
  const inAppBrowser = useUserAgentFlag(isInAppBrowserUserAgent);
  return (
    <>
      <Card className="block p-4 sm:hidden">
        <p className="text-center text-lg font-bold">{amount}</p>
        {inAppBrowser && (
          <Notice tone="warning" className="my-3">
            Банкаа сонгоход <b>&quot;You&apos;re leaving our app&quot;</b> гэсэн цонх гарвал <b>CONTINUE</b> (Үргэлжлүүлэх) товчийг дарна уу. Банкны апп нээгдэнэ.
          </Notice>
        )}
        {qr.urls.map((item) => (
          <a key={item.link} href={toBankAppLink(item.link, isAndroid)} className="flex items-center justify-between gap-3 border-b p-2 last:border-b-0">
            {item.logo ? <img src={item.logo} alt="" className="size-8 rounded-md" /> : <span className="size-8" />}
            <span className="flex-1 text-center font-bold">{item.description || item.name}</span>
            <span className="text-muted-foreground" aria-hidden>&gt;</span>
          </a>
        ))}
      </Card>
      <Card className="hidden p-8 sm:block">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Building2 className="size-8 text-primary" />
            <h1 className="text-xl font-semibold">Төлөх дүн</h1>
          </div>
          <QrCode className="size-8 text-muted-foreground" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-2xl font-semibold">{amount}</p>
          <p className="text-center text-muted-foreground">Та доорх QR кодыг уншуулж төлбөрөө төлнө үү.</p>
          {qr.image && (
            <div className="rounded-md bg-muted p-4">
              <img src={`data:image/png;base64,${qr.image}`} alt="QPay QR код" className="size-60 bg-white object-cover" />
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
