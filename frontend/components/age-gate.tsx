'use client';
import { Button } from '@/components/ui/button';

// 18+ кино эхлэхээс өмнөх асуулт. Санамсаргүй Enter дарахад зөвшөөрөхгүй: анхаарал "Үгүй" дээр очно.
export function AgeGate({ title, onConfirm, onDecline }: { title: string; onConfirm: () => void; onDecline: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div role="alertdialog" aria-labelledby="age-gate-question" aria-describedby="age-gate-detail" className="w-full max-w-sm rounded-lg border bg-card p-6 text-center text-card-foreground">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-lg font-black text-primary-foreground">18+</span>
        <h1 id="age-gate-question" className="mt-4 text-xl font-black">Та 18 нас хүрсэн үү?</h1>
        <p id="age-gate-detail" className="mt-2 text-sm text-muted-foreground">&ldquo;{title}&rdquo; кино зөвхөн 18 ба түүнээс дээш насны үзэгчдэд зориулагдсан.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" autoFocus onClick={onDecline}>Үгүй</Button>
          <Button type="button" onClick={onConfirm}>Тийм</Button>
        </div>
      </div>
    </div>
  );
}
