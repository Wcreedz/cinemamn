'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AdminMovie, Category } from '@mongolflix/shared';
import { Field, NumberInput, Panel } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge, Notice } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const VIDEO_LABELS: Record<string, string> = { none: 'Видеогүй', uploading: 'Байршуулж байна', queued: 'Дараалалд', processing: 'Боловсруулж байна', ready: 'Бэлэн', failed: 'Алдаатай' };

const blank = { title: '', slug: '', originalTitle: '', description: '', poster: '', backdrop: '', trailerUrl: '', releaseYear: NaN, duration: NaN, director: '', language: 'Монгол', country: '', cast: '', genres: [] as string[], isPublished: false, featured: false };

// Зураг ачаалагдахгүй бол хоосон зай биш, шалтгааныг нь харуулна.
function ImagePreview({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (failed) return <Notice tone="danger" className="mb-2 break-all">Зураг ачаалагдсангүй: {src}</Notice>;
  return <img src={src} alt="" onError={() => setFailed(true)} className={`mb-2 rounded-md object-cover ${className}`} />;
}

export function MovieForm({ movie, onChanged }: { movie?: AdminMovie; onChanged?: () => void }) {
  const router = useRouter();
  const cats = useApi<{ items: Category[] }>('/api/admin/categories');
  const [f, setF] = useState(() => movie ? {
    ...blank, ...movie, originalTitle: movie.originalTitle ?? '', poster: movie.poster ?? '', backdrop: movie.backdrop ?? '', trailerUrl: movie.trailerUrl ?? '',
    releaseYear: movie.releaseYear ?? NaN, duration: movie.duration ? Math.round(movie.duration / 60) : NaN, director: movie.director ?? '', language: movie.language ?? '', country: movie.country ?? '',
    description: movie.description ?? '', cast: movie.cast.join(', '), genres: movie.genres.map((g) => g.id),
  } : blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const body = {
      title: f.title, slug: f.slug, originalTitle: f.originalTitle || undefined, description: f.description, poster: f.poster || undefined, backdrop: f.backdrop || undefined,
      trailerUrl: f.trailerUrl, releaseYear: Number.isNaN(f.releaseYear) ? undefined : f.releaseYear, duration: Number.isNaN(f.duration) ? undefined : f.duration * 60,
      director: f.director || undefined, language: f.language || undefined, country: f.country || undefined,
      cast: f.cast.split(',').map((s) => s.trim()).filter(Boolean), genres: f.genres, isPublished: f.isPublished, featured: f.featured,
    };
    try {
      if (movie) {
        await api(`/api/admin/movies/${movie.id}`, { method: 'PUT', body });
        setMsg({ ok: true, text: 'Хадгалагдлаа.' });
        onChanged?.();
      } else {
        const created = await api<AdminMovie>('/api/admin/movies', { body });
        router.push(`/admin/movies/${created.id}`);
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  const uploadImage = async (kind: 'poster' | 'backdrop', file?: File) => {
    if (!file || !movie) return;
    const form = new FormData();
    form.append('image', file);
    try {
      const r = await api<{ url: string }>(`/api/admin/movies/${movie.id}/image?kind=${kind}`, { form });
      set(kind, r.url);
      setMsg({ ok: true, text: 'Зураг байршлаа.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  // Том файлын явцыг харуулахын тулд fetch биш XHR ашиглана.
  const uploadVideo = async (file?: File) => {
    if (!file || !movie) return;
    setMsg(null);
    // Том файл дамжуулж дуусаад алдаа авахгүйн тулд серверийн бэлэн байдлыг эхлээд шалгана.
    try {
      await api('/api/admin/video-tools');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
      return;
    }
    const form = new FormData();
    form.append('video', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/movies/${movie.id}/upload`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => setProgress(e.lengthComputable ? e.loaded / e.total : null);
    xhr.onloadend = () => {
      setProgress(null);
      if (xhr.status === 202) { setMsg({ ok: true, text: 'Видео дараалалд орлоо. Боловсруулж дуусмагц бэлэн болно.' }); onChanged?.(); }
      else {
        let text = 'Видео байршуулахад алдаа гарлаа.';
        try { text = JSON.parse(xhr.responseText).error.message; } catch { /* JSON биш хариу */ }
        setMsg({ ok: false, text });
      }
    };
    setProgress(0);
    xhr.send(form);
  };

  const retryVideo = async () => {
    if (!movie) return;
    setMsg(null);
    try {
      await api(`/api/admin/movies/${movie.id}/video/retry`, { method: 'POST' });
      setMsg({ ok: true, text: 'Дахин дараалалд орлоо.' });
      onChanged?.();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  const remove = async () => {
    if (!movie || !window.confirm(`"${movie.title}" киног бүрэн устгах уу? Видео файлууд мөн устана.`)) return;
    try {
      await api(`/api/admin/movies/${movie.id}`, { method: 'DELETE' });
      router.push('/admin/movies');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Panel className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Гарчиг" id="title"><Input id="title" required value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Slug" id="slug" hint="Латин жижиг үсэг, тоо, зураас"><Input id="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
          <Field label="Эх гарчиг" id="orig"><Input id="orig" value={f.originalTitle} onChange={(e) => set('originalTitle', e.target.value)} /></Field>
          <Field label="Найруулагч" id="dir"><Input id="dir" value={f.director} onChange={(e) => set('director', e.target.value)} /></Field>
        </div>
        <Field label="Тайлбар" id="desc"><Textarea id="desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Жүжигчид" id="cast" hint="Таслалаар тусгаарлана"><Input id="cast" value={f.cast} onChange={(e) => set('cast', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Он"><NumberInput value={f.releaseYear} onChange={(v) => set('releaseYear', v)} /></Field>
          <Field label="Хугацаа (мин)"><NumberInput value={f.duration} onChange={(v) => set('duration', v)} /></Field>
          <Field label="Хэл"><Input value={f.language} onChange={(e) => set('language', e.target.value)} /></Field>
          <Field label="Улс"><Input value={f.country} onChange={(e) => set('country', e.target.value)} /></Field>
        </div>
        <Field label="Трейлер URL"><Input type="url" value={f.trailerUrl} onChange={(e) => set('trailerUrl', e.target.value)} /></Field>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ангилал</p>
          <div className="flex flex-wrap gap-2">
            {cats.data?.items.map((c) => {
              const on = f.genres.includes(c.id);
              return <button type="button" key={c.id} aria-pressed={on} onClick={() => set('genres', on ? f.genres.filter((g) => g !== c.id) : [...f.genres, c.id])} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-accent text-primary' : ''}`}>{c.name}</button>;
            })}
            {cats.data && !cats.data.items.length && <Link className="text-sm text-primary underline" href="/admin/categories">Эхлээд ангилал нэмнэ үү</Link>}
          </div>
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">Нийтлэх<Switch checked={f.isPublished} onCheckedChange={(v) => set('isPublished', v)} /></label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">Онцлох<Switch checked={f.featured} onCheckedChange={(v) => set('featured', v)} /></label>
          {msg && <Notice tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Notice>}
          <Button type="submit" className="w-full">{movie ? 'Хадгалах' : 'Үүсгэх'}</Button>
          {movie && f.isPublished && <Button asChild variant="outline" className="w-full"><Link href={`/movies/${f.slug}`} target="_blank">Урьдчилж харах</Link></Button>}
          {movie && <Button type="button" variant="destructive" className="w-full" onClick={() => void remove()}>Устгах</Button>}
        </Panel>
        {movie ? (
          <Panel className="space-y-4">
            <Field label="Постер">
              {f.poster && <ImagePreview src={f.poster} className="h-32" />}
              <Input type="file" accept="image/jpeg,image/png,image/webp" className="pt-2" onChange={(e) => void uploadImage('poster', e.target.files?.[0])} />
            </Field>
            <Field label="Арын зураг">
              {f.backdrop && <ImagePreview src={f.backdrop} className="h-24" />}
              <Input type="file" accept="image/jpeg,image/png,image/webp" className="pt-2" onChange={(e) => void uploadImage('backdrop', e.target.files?.[0])} />
            </Field>
            <Field label="Эх видео" hint="FFmpeg тусдаа worker дээр HLS болгож боловсруулна.">
              <p className="mb-2 text-sm">Төлөв: <Badge tone={movie.videoStatus === 'ready' ? 'success' : movie.videoStatus === 'failed' ? 'danger' : 'neutral'}>{VIDEO_LABELS[movie.videoStatus] ?? movie.videoStatus}</Badge></p>
              {movie.videoError && <Notice tone="danger" className="mb-2">{movie.videoError}</Notice>}
              {movie.videoRetryable && <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={() => void retryVideo()}>Дахин боловсруулах</Button>}
              <Input type="file" accept="video/*,.mkv" className="pt-2" disabled={progress !== null} onChange={(e) => void uploadVideo(e.target.files?.[0])} />
              {progress !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
            </Field>
          </Panel>
        ) : <Notice>Үүсгэсний дараа постер, видео байршуулах боломжтой.</Notice>}
      </div>
    </form>
  );
}
