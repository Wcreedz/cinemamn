'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Бүх нууц үгийн талбар үүнийг ашиглана: нүдний товчоор бичсэнээ харж болно.
export function PasswordInput({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        aria-label={show ? 'Нууц үгийг нуух' : 'Нууц үгийг харуулах'}
        aria-pressed={show}
        onClick={() => setShow(!show)}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
      >
        {show ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </div>
  );
}
