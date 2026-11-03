'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const GAP = 8;

// Хөтчийн confirm-ийн оронд товчны дэргэд гарах асуулт.
// Хүснэгтийн overflow-д таслагдахгүйн тулд portal-оор гаргана. Theme-ийн өнгө алдагдахгүй: товчны admin-theme дотор байрлана.
export function Confirm({ question, detail, className, onConfirm, children }: { question: string; detail?: string; className?: string; onConfirm: () => void; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const open = !!host;

  useLayoutEffect(() => {
    if (!open || !anchor.current || !box.current) return;
    const trigger = anchor.current.getBoundingClientRect();
    const { width, height } = box.current.getBoundingClientRect();
    const below = trigger.bottom + GAP + height <= window.innerHeight;
    box.current.style.left = `${Math.max(GAP, Math.min(trigger.right - width, window.innerWidth - width - GAP))}px`;
    box.current.style.top = `${below ? trigger.bottom + GAP : Math.max(GAP, trigger.top - height - GAP)}px`;
    box.current.style.visibility = 'visible';
    // Санамсаргүй Enter дарахад устгахгүй: анхаарал "Үгүй" дээр очно.
    box.current.querySelector('button')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setHost(null);
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) dismiss(); };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      dismiss();
      anchor.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    // Гүйлгэхэд асуулт товчноосоо салахгүй.
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <>
      <span ref={anchor} className={cn('inline-flex', className)} onClick={(e) => setHost(e.currentTarget.closest('.admin-theme') ?? document.body)}>{children}</span>
      {host && createPortal(
        <div ref={box} role="alertdialog" aria-label={question} style={{ left: 0, top: 0, visibility: 'hidden' }} className="fixed z-50 w-max max-w-[min(20rem,calc(100vw-1rem))] rounded-lg border bg-card p-3 text-foreground shadow-lg">
          <div className="flex gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{question}</p>
              {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setHost(null); anchor.current?.querySelector('button')?.focus(); }}>Үгүй</Button>
            <Button type="button" size="sm" onClick={() => { setHost(null); onConfirm(); }}>Тийм</Button>
          </div>
        </div>,
        host,
      )}
    </>
  );
}
