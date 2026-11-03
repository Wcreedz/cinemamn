'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, Film, ImageIcon, Loader2 } from 'lucide-react';
import type { AdminMovie, Category } from '@mongolflix/shared';
import { Field, Panel } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge, Notice } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { api, API_BASE } from '@/lib/api';
import { compressImage } from '@/lib/compress-image';

const VIDEO_LABELS: Record<string, string> = { none: 'Видеогүй', uploading: 'Байршуулж байна', queued: 'Дараалалд', processing: 'Боловсруулж байна', ready: 'Бэлэн', failed: 'Алдаатай' };
const POSTER_MAX_SIDE = 1200;
const BACKDROP_MAX_SIDE = 1920;

export function VideoBadge({ movie }: { movie: Pick<AdminMovie, 'videoStatus' | 'videoProgress'> }) {
  const { videoStatus: status, videoProgress: percent } = movie;
  const working = status === 'uploading' || status === 'queued' || status === 'processing';
  return (
    <Badge tone={status === 'ready' ? 'success' : status === 'failed' ? 'danger' : working ? 'primary' : 'neutral'} className="gap-1 whitespace-nowrap">
      {working && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {VIDEO_LABELS[status] ?? status}{status === 'processing' && percent ? ` ${percent}%` : ''}
    </Badge>
  );
}

interface UploadState { loaded: number; total: number; speed: number }
interface SaveTask { steps: string[]; current: number; upload: UploadState | null }

const duration = (seconds: number) => (seconds < 60 ? 'Бараг дууслаа' : seconds < 3600 ? `~${Math.ceil(seconds / 60)} мин үлдсэн` : `~${(seconds / 3600).toFixed(1)} цаг үлдсэн`);

// Хадгалалт, файл байршуулалтын аль шатанд явааг хаасан цонхоор харуулж, давхар дарахаас сэргийлнэ.
function SaveProgress({ task }: { task: SaveTask }) {
  const { upload } = task;
  const percent = upload ? Math.floor((upload.loaded / upload.total) * 100) : null;
  const left = upload && upload.speed > 0 ? (upload.total - upload.loaded) / upload.speed : null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-card p-6 text-card-foreground shadow-lg">
        <ul className="space-y-3">
          {task.steps.map((step, i) => (
            <li key={step} className={`flex items-center gap-3 text-sm font-semibold ${i > task.current ? 'text-muted-foreground' : ''}`}>
              {i < task.current ? <Check className="size-5 shrink-0 text-success" aria-hidden /> : i === task.current ? <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden /> : <span className="size-5 shrink-0 rounded-full border-2" aria-hidden />}
              {step}
            </li>
          ))}
        </ul>
        {upload && percent !== null && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></div>
            {upload.loaded >= upload.total
              ? <p className="text-xs text-muted-foreground">Сервер файлыг хүлээн авч байна…</p>
              : <p className="text-xs text-muted-foreground">{percent}% · {fileSize(upload.loaded)} / {fileSize(upload.total)}{upload.speed > 0 ? ` · ${(upload.speed / 1024 ** 2).toFixed(1)} MB/с` : ''}{left !== null ? ` · ${duration(left)}` : ''}</p>}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Дуустал хуудсаа битгий хаагаарай.</p>
      </div>
    </div>
  );
}

const blank = { title: '', description: '', poster: '', backdrop: '', trailerUrl: '', genres: [] as string[], isPublished: true, featured: false };

const fileSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);

// Зураг ачаалагдахгүй бол хоосон зай биш, шалтгааныг нь харуулна.
function ImagePreview({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (failed) return <Notice tone="danger" className="mb-2 break-all">Зураг ачаалагдсангүй: {src}</Notice>;
  return <img src={src} alt="" onError={() => setFailed(true)} className={`mb-2 rounded-md object-cover ${className}`} />;
}

function FilePicker({ label, accept, file, disabled, large, onPick }: { label: string; accept: string; file: File | null; disabled?: boolean; large?: boolean; onPick: (file: File) => void }) {
  const Icon = large ? Film : ImageIcon;
  return (
    <label className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center text-sm font-semibold transition-colors hover:border-primary hover:bg-accent focus-within:border-primary has-disabled:pointer-events-none has-disabled:opacity-50 ${large ? 'flex-col px-4 py-8' : 'px-3 py-3'} ${file ? 'border-primary bg-accent text-primary' : ''}`}>
      <input type="file" accept={accept} className="sr-only" disabled={disabled} onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ''; if (picked) onPick(picked); }} />
      <Icon className={large ? 'size-8' : 'size-5 shrink-0'} aria-hidden />
      <span className="min-w-0 break-all">{file ? `${file.name} (${fileSize(file.size)})` : label}</span>
    </label>
  );
}

function ImageField({ label, src, file, disabled, previewClass, onPick }: { label: string; src: string; file: File | null; disabled: boolean; previewClass: string; onPick: (file: File) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const shown = preview ?? src;
  return (
    <Field label={label}>
      {shown && <ImagePreview src={shown} className={previewClass} />}
      <FilePicker label="Зураг сонгох" accept="image/jpeg,image/png,image/webp" file={file} disabled={disabled} onPick={onPick} />
    </Field>
  );
}

export function MovieForm({ movie, onChanged }: { movie?: AdminMovie; onChanged?: () => void }) {
  const router = useRouter();
  const cats = useApi<{ items: Category[] }>('/api/admin/categories');
  const [f, setF] = useState(() => movie ? {
    ...blank, title: movie.title, isPublished: movie.isPublished, featured: movie.featured,
    poster: movie.poster ?? '', backdrop: movie.backdrop ?? '', trailerUrl: movie.trailerUrl ?? '',
    description: movie.description ?? '', genres: movie.genres.map((g) => g.id),
  } : blank);
  // Файл байршуулахад алдаа гарвал дахин дарахад шинэ кино биш, энэ кино шинэчлэгдэнэ.
  const [created, setCreated] = useState<AdminMovie | null>(null);
  const current = movie ?? created;
  const [video, setVideo] = useState<File | null>(null);
  const [images, setImages] = useState<{ poster: File | null; backdrop: File | null }>({ poster: null, backdrop: null });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [task, setTask] = useState<SaveTask | null>(null);
  const busy = task !== null;
  const set =<K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));

  // Том файл дамжуулж байхад хуудас хаагдвал байршуулалт тасарна.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const uploadImage = async (id: string, kind: 'poster' | 'backdrop', file: File) => {
    const form = new FormData();
    form.append('image', await compressImage(file, kind === 'poster' ? POSTER_MAX_SIDE : BACKDROP_MAX_SIDE));
    const r = await api<{ url: string }>(`/api/admin/movies/${id}/image?kind=${kind}`, { form });
    set(kind, r.url);
    setImages((s) => ({ ...s, [kind]: null }));
  };

  // Том файлын явцыг харуулахын тулд fetch биш XHR ашиглана.
  const uploadVideo = async (id: string, file: File) => {
    // Том файл дамжуулж дуусаад алдаа авахгүйн тулд серверийн бэлэн байдлыг эхлээд шалгана.
    await api('/api/admin/video-tools');
    const form = new FormData();
    form.append('video', file);
    const startedAt = Date.now();
    const setUpload = (upload: UploadState | null) => setTask((t) => t && { ...t, upload });
    setUpload({ loaded: 0, total: file.size, speed: 0 });
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/admin/movies/${id}/upload`);
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUpload({ loaded: e.loaded, total: e.total, speed: e.loaded / Math.max(1, (Date.now() - startedAt) / 1000) });
        };
        xhr.onloadend = () => {
          if (xhr.status === 202) { resolve(); return; }
          let text = xhr.status === 0 || xhr.status >= 502
            ? 'Холболт тасарлаа. Файл том бол Vercel-ээр дамжихгүй байж магадгүй: серверийн шууд хаягаар админд орж байршуулна уу.'
            : 'Видео байршуулахад алдаа гарлаа.';
          try { text = JSON.parse(xhr.responseText).error.message; } catch { /* JSON биш хариу */ }
          reject(new Error(text));
        };
        xhr.send(form);
      });
      setVideo(null);
    } finally {
      setUpload(null);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const hasImages = !!(images.poster || images.backdrop);
    setTask({
      steps: ['Мэдээлэл хадгалж байна', ...(hasImages ? ['Зураг байршуулж байна'] : []), ...(video ? ['Кино файл байршуулж байна'] : [])],
      current: 0, upload: null,
    });
    const nextStep = () => setTask((t) => t && { ...t, current: t.current + 1 });
    const body = {
      title: f.title, description: f.description, poster: f.poster || undefined, backdrop: f.backdrop || undefined,
      trailerUrl: f.trailerUrl, genres: f.genres, isPublished: f.isPublished, featured: f.featured,
    };
    try {
      let saved = current;
      if (saved) await api(`/api/admin/movies/${saved.id}`, { method: 'PUT', body });
      else {
        saved = await api<AdminMovie>('/api/admin/movies', { body });
        setCreated(saved);
      }
      const { id } = saved;
      if (hasImages) {
        nextStep();
        await Promise.all([
          images.poster && uploadImage(id, 'poster', images.poster),
          images.backdrop && uploadImage(id, 'backdrop', images.backdrop),
        ]);
      }
      if (video) {
        nextStep();
        await uploadVideo(id, video);
      }
      // Дууссаны дараа маягтад юу ч үлдэхгүй: жагсаалтаас үр дүн, боловсруулалтын явцыг харна.
      router.push(`/admin/movies?notice=${movie ? 'saved' : 'created'}${video ? '-video' : ''}${f.isPublished ? '' : '&draft=1'}`);
    } catch (err) {
      setTask(null);
      setMsg({ ok: false, text: (err as Error).message });
      onChanged?.();
    }
  };

  const retryVideo = async () => {
    if (!current) return;
    setMsg(null);
    try {
      await api(`/api/admin/movies/${current.id}/video/retry`, { method: 'POST' });
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

  const processing = movie?.videoStatus === 'queued' || movie?.videoStatus === 'processing';

  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      {task && <SaveProgress task={task} />}
      <div className="min-w-0 space-y-6">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Кино файл</h2>
            {movie && <VideoBadge movie={movie} />}
          </div>
          <FilePicker large label={movie?.videoStatus === 'ready' ? 'Киног солих бол шинэ файл сонгоно уу' : 'Энд дарж кино файлаа сонгоно уу'} accept="video/*,.mkv" file={video} disabled={busy} onPick={setVideo} />
          <p className="text-xs text-muted-foreground">MP4, MKV, MOV, WEBM, AVI. Файл сонгосны дараа доорх мэдээллийг бөглөөд &quot;{movie ? 'Хадгалах' : 'Кино нэмэх'}&quot; товчийг дарна.</p>
          {processing &&<Notice>Кино боловсруулагдаж байна. Хуудсаа хаасан ч үргэлжилнэ, дуусмагц &quot;Бэлэн&quot; болно.</Notice>}
          {current?.videoError && <Notice tone="danger">{current.videoError}</Notice>}
          {current?.videoRetryable && <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void retryVideo()}>Дахин боловсруулах</Button>}
        </Panel>
        <Panel className="space-y-4">
          <Field label="Гарчиг" id="title"><Input id="title" required value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Тайлбар" id="desc"><Textarea id="desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
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
      </div>
      <div className="space-y-6">
        <Panel className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold"><span>Нийтлэх<span className="block text-xs font-normal text-muted-foreground">Асаавал сайтад харагдана.</span></span><Switch checked={f.isPublished} onCheckedChange={(v) => set('isPublished', v)} /></label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">Онцлох<Switch checked={f.featured} onCheckedChange={(v) => set('featured', v)} /></label>
          {msg && <Notice tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Хадгалж байна…' : movie ? 'Хадгалах' : 'Кино нэмэх'}</Button>
          {movie && f.isPublished && <Button asChild variant="outline" className="w-full"><Link href={`/movies/${movie.slug}`} target="_blank">Урьдчилж харах</Link></Button>}
          {movie && <Button type="button" variant="destructive" className="w-full" disabled={busy} onClick={() => void remove()}>Устгах</Button>}
        </Panel>
        <Panel className="space-y-4">
          <ImageField label="Постер" src={f.poster} file={images.poster} disabled={busy} previewClass="h-32" onPick={(file) => setImages((s) => ({ ...s, poster: file }))} />
          <ImageField label="Арын зураг" src={f.backdrop} file={images.backdrop} disabled={busy} previewClass="h-24" onPick={(file) => setImages((s) => ({ ...s, backdrop: file }))} />
        </Panel>
      </div>
    </form>
  );
}
