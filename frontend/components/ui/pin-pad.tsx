'use client';
import { useEffect, useState } from 'react';
import { Delete, Eye, EyeOff } from 'lucide-react';
import { Label } from '@/components/ui/input';
import { PIN_LENGTH } from '@/components/ui/password-input';
import { cn } from '@/lib/utils';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const KEY = 'flex h-14 cursor-pointer touch-manipulation select-none items-center justify-center rounded-full text-xl font-bold hover:bg-accent active:bg-accent disabled:cursor-not-allowed disabled:opacity-50';

interface PinPadProps {
  id: string;
  label: string;
  value: string;
  onValue: (value: string) => void;
  // Сүүлийн орон орж ирэхэд нэг удаа дуудагдана.
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}

// Утсанд дэлгэцийн товчлуураар, компьютерт хулгана эсвэл гарын тоогоор оруулна.
// Жинхэнэ input нь цэгүүдийн дээр ил биш байрлаж, формын шалгалт, дэлгэц уншигч, нууц үг хадгалагчид ажиллана.
export function PinPad({ id, label, value, onValue, onComplete, disabled, autoComplete = 'off' }: PinPadProps) {
  const [show, setShow] = useState(false);

  const change = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
    if (next === value) return;
    onValue(next);
    if (next.length === PIN_LENGTH) onComplete?.(next);
  };

  // Өөр талбарт бичиж байгаагаас бусад үед компьютерын гарын тоо шууд орно.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (/^[0-9]$/.test(e.key)) change(value + e.key);
      else if (e.key === 'Backspace') change(value.slice(0, -1));
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      <Label htmlFor={id} className="mb-3 text-center">{label}</Label>
      <div className="relative mx-auto w-fit px-10">
        <div className="relative flex gap-2 rounded-md has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className="flex size-9 items-center justify-center text-lg font-bold" aria-hidden="true">
              {show && value[i]
                ? value[i]
                : <span className={cn('size-4 rounded-full transition-colors', value[i] ? 'bg-primary' : 'border-2 border-muted-foreground/40')} />}
            </span>
          ))}
          <input
            id={id} type="password" inputMode="none" autoComplete={autoComplete} required disabled={disabled}
            maxLength={PIN_LENGTH} pattern={`[0-9]{${PIN_LENGTH}}`} title="4 оронтой тоо оруулна уу"
            value={value} onChange={(e) => change(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </div>
        <button
          type="button" tabIndex={-1} aria-label={show ? 'Нууц үгийг нуух' : 'Нууц үгийг харуулах'} aria-pressed={show}
          onClick={() => setShow(!show)}
          className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {show ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
      {/* tabIndex=-1: Tab дарахад 11 товчоор гүйхгүй. Хулганаар дарахад input-ийн фокус алдагдахгүй. */}
      <div role="group" aria-label="Тоон товчлуур" className="mx-auto mt-4 grid max-w-72 grid-cols-3 gap-1" onMouseDown={(e) => e.preventDefault()}>
        {DIGITS.map((d) => <button key={d} type="button" tabIndex={-1} disabled={disabled} className={KEY} onClick={() => change(value + d)}>{d}</button>)}
        <span />
        <button type="button" tabIndex={-1} disabled={disabled} className={KEY} onClick={() => change(`${value}0`)}>0</button>
        <button type="button" tabIndex={-1} disabled={disabled} aria-label="Устгах" className={KEY} onClick={() => change(value.slice(0, -1))}><Delete className="size-6" /></button>
      </div>
    </div>
  );
}
