'use client';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { PIN_LENGTH } from '@/components/ui/password-input';
import { cn } from '@/lib/utils';

interface PinFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onValue: (value: string) => void;
  // Сүүлийн орон орж ирэхэд нэг удаа дуудагдана.
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
}

// 4 нүдтэй нууц үгийн талбар. Жинхэнэ ганц input нүднүүдийн дээр ил биш байрлана:
// утасны тоон гар, буулгах, формын шалгалт, дэлгэц уншигч, нууц үг хадгалагч бүгд түүгээр ажиллана.
export function PinField({ id, label, hint, value, onValue, onComplete, disabled, autoComplete = 'off', autoFocus }: PinFieldProps) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Алхам солигдоход (key өөрчлөгдөж дахин үүснэ) дараагийн нүдэнд шууд бичнэ.
  useEffect(() => {
    if (autoFocus) input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- зөвхөн үүсэх үед
  }, []);

  const change = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
    if (next === value) return;
    onValue(next);
    if (next.length === PIN_LENGTH) onComplete?.(next);
  };
  // Нүд бүр нэг орон: заагч үргэлж төгсгөлд байж, дундаас нь засаж нүд андуурахгүй.
  const caretToEnd = (el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length);
  const active = focused ? Math.min(value.length, PIN_LENGTH - 1) : -1;

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5">
        <label htmlFor={id} className="font-bold">{label}</label>
        <button
          type="button" aria-label={show ? 'Нууц үгийг нуух' : 'Нууц үгийг харуулах'} aria-pressed={show}
          onClick={() => setShow(!show)}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          {show ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className={cn('relative mx-auto mt-3 flex w-fit gap-2.5', disabled && 'opacity-60')}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i} aria-hidden="true"
            className={cn(
              'flex size-12 items-center justify-center rounded-xl border bg-muted/40 text-lg font-bold transition-colors',
              i === active ? 'border-primary ring-1 ring-primary' : value[i] ? 'border-primary/50' : 'border-border',
            )}
          >
            {value[i] && (show ? value[i] : <span className="size-2.5 rounded-full bg-foreground" />)}
          </span>
        ))}
        <input
          ref={input} id={id} type="password" inputMode="numeric" autoComplete={autoComplete} required disabled={disabled}
          maxLength={PIN_LENGTH} pattern={`[0-9]{${PIN_LENGTH}}`} title="4 оронтой тоо оруулна уу"
          value={value} onChange={(e) => change(e.target.value)}
          onFocus={(e) => { setFocused(true); caretToEnd(e.currentTarget); }} onBlur={() => setFocused(false)}
          onClick={(e) => caretToEnd(e.currentTarget)}
          className="absolute inset-0 size-full cursor-text opacity-0"
        />
      </div>
    </div>
  );
}

export function PinSteps({ step, total }: { step: number; total: number }) {
  return (
    <div role="img" aria-label={`Алхам ${step + 1} / ${total}`} className="flex justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-7 bg-primary' : i < step ? 'w-4 bg-primary/50' : 'w-4 bg-muted')} />)}
    </div>
  );
}
