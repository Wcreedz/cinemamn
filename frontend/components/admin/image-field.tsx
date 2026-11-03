'use client';
import { useEffect, useState } from 'react';
import { Film, ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { compressImage } from '@/lib/compress-image';

export const POSTER_MAX_SIDE = 1200;
export const BACKDROP_MAX_SIDE = 1920;

export const fileSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);

export async function uploadImageFile(url: string, file: File, maxSide: number) {
  const form = new FormData();
  form.append('image', await compressImage(file, maxSide));
  return (await api<{ url: string }>(url, { form })).url;
}

// Зураг ачаалагдахгүй бол хоосон зай биш, шалтгааныг нь харуулна.
function ImagePreview({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (failed) return <Notice tone="danger" className="break-all">Зураг ачаалагдсангүй: {src}</Notice>;
  return <img src={src} alt="" onError={() => setFailed(true)} className={`rounded-md object-cover ${className}`} />;
}

export function FilePicker({ label, accept, file, disabled, large, onPick }: { label: string; accept: string; file: File | null; disabled?: boolean; large?: boolean; onPick: (file: File) => void }) {
  const Icon = large ? Film : ImageIcon;
  return (
    <label className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center text-sm font-semibold transition-colors hover:border-primary hover:bg-accent focus-within:border-primary has-disabled:pointer-events-none has-disabled:opacity-50 ${large ? 'flex-col px-4 py-8' : 'px-3 py-3'} ${file ? 'border-primary bg-accent text-primary' : ''}`}>
      <input type="file" accept={accept} className="sr-only" disabled={disabled} onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ''; if (picked) onPick(picked); }} />
      <Icon className={large ? 'size-8' : 'size-5 shrink-0'} aria-hidden />
      <span className="min-w-0 break-all">{file ? `${file.name} (${fileSize(file.size)})` : label}</span>
    </label>
  );
}

// Сонгосон, устгасан зураг "Хадгалах" дарахад л хэрэгжинэ.
export function ImageField({ label, hint, src, file, disabled, previewClass, onPick, onRemove }: { label: string; hint?: string; src: string; file: File | null; disabled?: boolean; previewClass: string; onPick: (file: File) => void; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const shown = preview ?? src;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      {shown && <ImagePreview src={shown} className={previewClass} />}
      <FilePicker label={shown ? 'Зураг солих' : 'Зураг сонгох'} accept="image/jpeg,image/png,image/webp" file={file} disabled={disabled} onPick={onPick} />
      {shown && <Button type="button" variant="outline" size="sm" className="w-full text-destructive hover:bg-destructive hover:text-white" disabled={disabled} onClick={onRemove}><Trash2 />Зураг устгах</Button>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
