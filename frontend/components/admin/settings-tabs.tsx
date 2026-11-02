'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PublicUser } from '@mongolflix/shared';
import { Field, NumberInput, Panel, Table } from '@/components/admin/ui';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ErrorState, Notice } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { api, ApiClientError } from '@/lib/api';
import { dateTime, money } from '@/lib/utils';

type Msg = { ok: boolean; text: string } | null;
function useSaver() {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok = 'Хадгалагдлаа.') => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) {
      const d = (e as ApiClientError).details;
      const detail = Array.isArray(d) ? d.map((x: { path?: string; message?: string; name?: string }) => (x.path ? `${x.path}: ${x.message}` : x.message)).join('; ') : '';
      setMsg({ ok: false, text: detail && (e as ApiClientError).code === 'VALIDATION_ERROR' ? `${(e as Error).message} (${detail})` : (e as Error).message });
    } finally { setBusy(false); }
  };
  return { msg, busy, run };
}
const Feedback = ({ msg }: { msg: Msg }) => (msg ? <Notice tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Notice> : null);

interface Entry<T> { value: T; version: number }
export interface AllSettings {
  general: Entry<General>; subscription: Entry<Subscription>; video: Entry<Video>; security: Entry<Security>; homepage: Entry<Homepage>; videoAllowedRoots: string[];
}
interface General { siteName: string; logo: string; favicon: string; description: string; maintenanceMode: boolean }
interface PlanRow { code: string; name: string; price: number; durationDays: number; enabled: boolean }
interface Subscription { enabled: boolean; paymentRequired: boolean; currency: string; paymentExpiryMinutes: number; plans: PlanRow[] }
interface Video { storageRoot: string; hlsResolutions: number[]; maxUploadSizeMb: number; ffmpeg: { preset: string; crf: number; segmentSeconds: number; threads: number }; playbackTokenExpiryMinutes: number }
interface Security { sessionExpiryDays: number; loginMaxAttempts: number; loginLockMinutes: number; allowedAdminIps: string[] }
interface Banner { title: string; subtitle?: string; image?: string; link?: string; enabled: boolean }
interface Section { key: string; title: string; type: 'new' | 'popular' | 'continue' | 'category'; categorySlug?: string; visible: boolean; order: number }
interface Homepage { heroBanners: Banner[]; featuredMovieIds: string[]; sections: Section[] }

function useSection<T>(entry: Entry<T>, path: string, reload: () => Promise<void>) {
  const [form, setForm] = useState(entry.value);
  useEffect(() => { setForm(entry.value); }, [entry.value]);
  const saver = useSaver();
  const save = () => saver.run(async () => {
    await api(`/api/admin/settings/${path}`, { method: 'PUT', body: { value: form, expectedVersion: entry.version } });
    await reload();
  });
  return { form, setForm, save, ...saver };
}
const SaveRow = ({ msg, busy, save, label = 'Хадгалах' }: { msg: Msg; busy: boolean; save: () => void; label?: string }) => (
  <div className="space-y-3"><Feedback msg={msg} /><Button disabled={busy} onClick={save}>{busy ? 'Хадгалж байна…' : label}</Button></div>
);
const Toggle = ({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <label className="flex items-start justify-between gap-4">
    <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
  </label>
);

export function GeneralTab({ entry, reload }: { entry: Entry<General>; reload: () => Promise<void> }) {
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'general', reload);
  return (
    <Panel className="max-w-2xl space-y-4">
      <Field label="Сайтын нэр" id="site"><Input id="site" value={f.siteName} onChange={(e) => setForm({ ...f, siteName: e.target.value })} /></Field>
      <Field label="Лого URL" id="logo"><Input id="logo" value={f.logo} onChange={(e) => setForm({ ...f, logo: e.target.value })} /></Field>
      <Field label="Favicon URL" id="fav"><Input id="fav" value={f.favicon} onChange={(e) => setForm({ ...f, favicon: e.target.value })} /></Field>
      <Field label="Сайтын тайлбар" id="desc"><Textarea id="desc" value={f.description} onChange={(e) => setForm({ ...f, description: e.target.value })} /></Field>
      <Toggle label="Засварын горим" hint="Идэвхтэй үед энгийн хэрэглэгчид сайтыг ашиглах боломжгүй." checked={f.maintenanceMode} onChange={(v) => setForm({ ...f, maintenanceMode: v })} />
      <SaveRow msg={msg} busy={busy} save={() => void save()} />
    </Panel>
  );
}

export function SubscriptionTab({ entry, reload }: { entry: Entry<Subscription>; reload: () => Promise<void> }) {
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'subscription', reload);
  const setPlan = (i: number, p: Partial<PlanRow>) => setForm({ ...f, plans: f.plans.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div className="space-y-6">
      <Panel className="max-w-2xl space-y-4">
        <Toggle label="Эрх худалдаалах" hint="Унтраавал шинэ нэхэмжлэх үүсэхгүй." checked={f.enabled} onChange={(v) => setForm({ ...f, enabled: v })} />
      </Panel>
      <Panel className="space-y-4">
        <h2 className="font-bold">Багцууд</h2>
        <Notice>Үнэ, хугацааг өөрчлөхөд зөвхөн шинэ нэхэмжлэхэд хүчинтэй. Хүлээгдэж буй нэхэмжлэх анхны дүнгээрээ, идэвхтэй эрх анхны дуусах огноогоороо үлдэнэ.</Notice>
        {f.plans.map((p, i) => (
          <div key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_8rem_7rem_auto_auto]">
            <Field label="Код"><Input value={p.code} onChange={(e) => setPlan(i, { code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Нэр"><Input value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} /></Field>
            <Field label={`Үнэ (${f.currency})`}><NumberInput min={1} value={p.price} onChange={(v) => setPlan(i, { price: v })} /></Field>
            <Field label="Хоног"><NumberInput min={1} value={p.durationDays} onChange={(v) => setPlan(i, { durationDays: v })} /></Field>
            <div className="flex h-10 items-center"><Switch aria-label="Идэвхтэй" checked={p.enabled} onCheckedChange={(v) => setPlan(i, { enabled: v })} /></div>
            <Button variant="ghost" size="icon" aria-label="Устгах" disabled={f.plans.length <= 1} onClick={() => setForm({ ...f, plans: f.plans.filter((_, j) => j !== i) })}><Trash2 /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setForm({ ...f, plans: [...f.plans, { code: '', name: '', price: 0, durationDays: 30, enabled: false }] })}><Plus />Багц нэмэх</Button>
        <SaveRow msg={msg} busy={busy} save={() => void save()} />
      </Panel>
    </div>
  );
}

export function PaymentTab({ entry, reload }: { entry: Entry<Subscription>; reload: () => Promise<void> }) {
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'subscription', reload);
  return (
    <Panel className="max-w-2xl space-y-4">
      <h2 className="text-lg font-black uppercase">Төлбөрийн дүрэм</h2>
      <Toggle label="Төлбөр шаардах" hint="Унтраавал нэвтэрсэн бүх хэрэглэгч үнэгүй үзнэ." checked={f.paymentRequired} onChange={(v) => setForm({ ...f, paymentRequired: v })} />
      <Field label="Нэхэмжлэхийн хүчинтэй хугацаа (минут)"><NumberInput min={5} value={f.paymentExpiryMinutes} onChange={(v) => setForm({ ...f, paymentExpiryMinutes: v })} /></Field>
      <div className="text-sm text-muted-foreground">Одоогийн үнэ: {f.plans.filter((p) => p.enabled).map((p) => `${p.name} ${money(p.price, f.currency)}`).join(', ')}</div>
      <SaveRow msg={msg} busy={busy} save={() => void save()} />
    </Panel>
  );
}

const RES = [2160, 1440, 1080, 720, 480, 360];
export function VideoTab({ entry, roots, reload }: { entry: Entry<Video>; roots: string[]; reload: () => Promise<void> }) {
  const { user } = useApp();
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'video', reload);
  const tools = useApi<{ ok: boolean }>('/api/admin/video-tools');
  return (
    <Panel className="max-w-3xl space-y-4">
      {tools.error && <Notice tone="danger">{tools.error}</Notice>}
      <Field label="Видео хадгалах зам" hint="Серверийн VIDEO_ALLOWED_ROOTS-оос сонгоно. Зөвхөн Superadmin өөрчилнө. Өөрчилбөл Nginx-ийн замыг мөн шинэчилнэ.">
        <Select value={f.storageRoot} disabled={user?.role !== 'superadmin'} onChange={(e) => setForm({ ...f, storageRoot: e.target.value })}>
          {[...new Set([f.storageRoot, ...roots])].map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">HLS чанарууд</p>
        <div className="flex flex-wrap gap-2">
          {RES.map((r) => {
            const on = f.hlsResolutions.includes(r);
            return <button key={r} type="button" aria-pressed={on} onClick={() => setForm({ ...f, hlsResolutions: on ? f.hlsResolutions.filter((x) => x !== r) : [...f.hlsResolutions, r] })} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-accent text-primary' : ''}`}>{r}p</button>;
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Эх файлаас өндөр чанар үүсгэхгүй.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Файлын дээд хэмжээ (MB)"><NumberInput min={1} value={f.maxUploadSizeMb} onChange={(v) => setForm({ ...f, maxUploadSizeMb: v })} /></Field>
        <Field label="Тоглуулах токены хугацаа (мин)"><NumberInput min={1} value={f.playbackTokenExpiryMinutes} onChange={(v) => setForm({ ...f, playbackTokenExpiryMinutes: v })} /></Field>
      </div>
      <h3 className="pt-2 font-bold">FFmpeg</h3>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Preset"><Select value={f.ffmpeg.preset} onChange={(e) => setForm({ ...f, ffmpeg: { ...f.ffmpeg, preset: e.target.value } })}>{['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="CRF"><NumberInput min={16} max={32} value={f.ffmpeg.crf} onChange={(v) => setForm({ ...f, ffmpeg: { ...f.ffmpeg, crf: v } })} /></Field>
        <Field label="Сегмент (сек)"><NumberInput min={2} max={12} value={f.ffmpeg.segmentSeconds} onChange={(v) => setForm({ ...f, ffmpeg: { ...f.ffmpeg, segmentSeconds: v } })} /></Field>
        <Field label="Thread (0=авто)"><NumberInput min={0} value={f.ffmpeg.threads} onChange={(v) => setForm({ ...f, ffmpeg: { ...f.ffmpeg, threads: v } })} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">FFmpeg-ийн файлын зам аюулгүй байдлын үүднээс зөвхөн серверийн орчны хувьсагчаар тохируулагдана.</p>
      <SaveRow msg={msg} busy={busy} save={() => void save()} />
    </Panel>
  );
}

export function HomepageTab({ entry, reload }: { entry: Entry<Homepage>; reload: () => Promise<void> }) {
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'homepage', reload);
  const sections = [...f.sections].sort((a, b) => a.order - b.order);
  const setBanner = (i: number, p: Partial<Banner>) => setForm({ ...f, heroBanners: f.heroBanners.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const setSection = (key: string, p: Partial<Section>) => setForm({ ...f, sections: f.sections.map((s) => (s.key === key ? { ...s, ...p } : s)) });
  const move = (i: number, dir: number) => {
    const next = [...sections];
    const [s] = next.splice(i, 1);
    next.splice(i + dir, 0, s);
    setForm({ ...f, sections: next.map((x, order) => ({ ...x, order: order + 1 })) });
  };
  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <h2 className="font-bold">Hero баннер</h2>
        {f.heroBanners.map((b, i) => (
          <div key={i} className="grid items-end gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
            <Field label="Гарчиг"><Input value={b.title} onChange={(e) => setBanner(i, { title: e.target.value })} /></Field>
            <Field label="Дэд гарчиг"><Input value={b.subtitle ?? ''} onChange={(e) => setBanner(i, { subtitle: e.target.value })} /></Field>
            <Field label="Зураг URL"><Input value={b.image ?? ''} onChange={(e) => setBanner(i, { image: e.target.value })} /></Field>
            <Field label="Холбоос"><Input value={b.link ?? ''} onChange={(e) => setBanner(i, { link: e.target.value })} /></Field>
            <div className="flex h-10 items-center"><Switch aria-label="Идэвхтэй" checked={b.enabled} onCheckedChange={(v) => setBanner(i, { enabled: v })} /></div>
            <Button variant="ghost" size="icon" aria-label="Устгах" onClick={() => setForm({ ...f, heroBanners: f.heroBanners.filter((_, j) => j !== i) })}><Trash2 /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setForm({ ...f, heroBanners: [...f.heroBanners, { title: 'Шинэ баннер', enabled: false }] })}><Plus />Баннер нэмэх</Button>
        <Field label="Онцлох киноны ID-ууд" hint="Таслалаар тусгаарлана. Эхнийх нь hero-д гарна."><Input value={f.featuredMovieIds.join(', ')} onChange={(e) => setForm({ ...f, featuredMovieIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></Field>
      </Panel>
      <Panel className="space-y-3">
        <h2 className="font-bold">Хэсгүүд (дараалал, харагдац)</h2>
        <ul className="divide-y">
          {sections.map((s, i) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 py-2">
              <span className="flex flex-col">
                <button aria-label="Дээш" disabled={i === 0} onClick={() => move(i, -1)} className="cursor-pointer text-xs disabled:opacity-30">▲</button>
                <button aria-label="Доош" disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="cursor-pointer text-xs disabled:opacity-30">▼</button>
              </span>
              <Input aria-label="Хэсгийн нэр" className="max-w-xs" value={s.title} onChange={(e) => setSection(s.key, { title: e.target.value })} />
              <span className="text-xs text-muted-foreground">{s.type}{s.categorySlug ? `: ${s.categorySlug}` : ''}</span>
              <span className="ml-auto"><Switch aria-label="Харуулах" checked={s.visible} onCheckedChange={(v) => setSection(s.key, { visible: v })} /></span>
            </li>
          ))}
        </ul>
        <SaveRow msg={msg} busy={busy} save={() => void save()} />
      </Panel>
    </div>
  );
}

export function SecurityTab({ entry, reload }: { entry: Entry<Security>; reload: () => Promise<void> }) {
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'security', reload);
  return (
    <Panel className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Сешн (хоног)"><NumberInput min={1} value={f.sessionExpiryDays} onChange={(v) => setForm({ ...f, sessionExpiryDays: v })} /></Field>
        <Field label="Нэвтрэх оролдлого"><NumberInput min={3} value={f.loginMaxAttempts} onChange={(v) => setForm({ ...f, loginMaxAttempts: v })} /></Field>
        <Field label="Түгжих (минут)"><NumberInput min={1} value={f.loginLockMinutes} onChange={(v) => setForm({ ...f, loginLockMinutes: v })} /></Field>
      </div>
      <Field label="Админ IP хаягууд" hint="Заавал биш. Таслалаар тусгаарлана. Хоосон бол бүх IP. Өөрийн IP-гаа оруулахаа бүү мартаарай.">
        <Input value={f.allowedAdminIps.join(', ')} onChange={(e) => setForm({ ...f, allowedAdminIps: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
      </Field>
      <SaveRow msg={msg} busy={busy} save={() => void save()} />
    </Panel>
  );
}

export function AdminsTab() {
  const { user } = useApp();
  const { data, error, reload } = useApi<{ items: PublicUser[] }>(user?.role === 'superadmin' ? '/api/admin/admins' : null);
  const [f, setF] = useState({ email: '', phone: '', password: '', name: '', role: 'admin' });
  const { msg, busy, run } = useSaver();
  if (user?.role !== 'superadmin') return <Notice tone="warning">Админ удирдлага зөвхөн Superadmin-д нээлттэй.</Notice>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const add = () => run(async () => {
    await api('/api/admin/admins', { body: { email: f.email, phone: f.phone, name: f.name, role: f.role, ...(f.password ? { password: f.password } : {}) } });
    setF({ email: '', phone: '', password: '', name: '', role: 'admin' });
    await reload();
  }, 'Админ нэмэгдлээ.');
  const setRole = (u: PublicUser, role: string) => run(async () => {
    await api(`/api/admin/admins/${u.id}/role`, { method: 'PATCH', body: { role } });
    await reload();
  }, 'Эрх шинэчлэгдлээ.');
  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <h2 className="font-bold">Админ нэмэх</h2>
        <div className="grid gap-4 md:grid-cols-5">
          <Field label="Имэйл" hint="Нэвтрэхэд ашиглана."><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Утас"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Нэр"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Нууц үг" hint="Бүртгэлтэй хэрэглэгчид шаардлагагүй."><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Эрх"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="admin">Admin</option><option value="superadmin">Superadmin</option></Select></Field>
        </div>
        <Feedback msg={msg} />
        <Button disabled={busy || !f.phone || !f.email} onClick={() => void add()}>Нэмэх</Button>
      </Panel>
      <Table head={['Имэйл', 'Утас', 'Нэр', 'Эрх', 'Сүүлд нэвтэрсэн']}>
        {data?.items.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-3 font-semibold">{u.email ?? '—'}</td><td className="px-4 py-3">{u.phone}</td><td className="px-4 py-3">{u.name}</td>
            <td className="px-4 py-3">
              <Select aria-label="Эрх" className="w-auto" value={u.role} onChange={(e) => void setRole(u, e.target.value)}><option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></Select>
            </td>
            <td className="px-4 py-3">{dateTime(u.lastLoginAt)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
