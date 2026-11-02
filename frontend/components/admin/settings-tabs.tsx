'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, KeyRound, Link2, MessageSquare, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import type { PublicUser } from '@mongolflix/shared';
import { Field, NumberInput, Panel, Table } from '@/components/admin/ui';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Badge, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
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

const EndpointBox = ({ url, children }: { url: string; children?: React.ReactNode }) => (
  <div>
    <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em]"><Link2 className="size-4 text-primary" />Callback хаяг</p>
    <div className="rounded-lg bg-muted p-3 font-mono text-xs break-all text-primary">{url || 'Тохируулаагүй'}{children && <p className="mt-2 font-sans text-muted-foreground">{children}</p>}</div>
  </div>
);

interface QPayConfig { id: string; version: number; environment: 'sandbox' | 'production'; merchantName: string; baiguullagiinId: string; salbariinId: string; dansniiDugaar: string; callbackUrl: string; currency: string; enabled: boolean; isCurrent: boolean; createdAt: string }
interface QPayInfo { current: QPayConfig | null; versions: QPayConfig[]; server: { url: string | null; environment: string | null }; canEditProduction: boolean; credentialsSource: string }

export function PaymentTab({ entry, reload }: { entry: Entry<Subscription>; reload: () => Promise<void> }) {
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'subscription', reload);
  const qpay = useApi<QPayInfo>('/api/admin/settings/qpay');
  const c = qpay.data?.current;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel className="space-y-5">
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-accent text-primary"><CreditCard /></span>
          <div className="flex-1"><h2 className="text-lg font-black uppercase">QPay</h2><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">QR төлбөр · quickqpaypackv2</p></div>
          <Badge tone={c?.enabled ? 'success' : 'neutral'}>{c?.enabled ? 'Идэвхтэй' : 'Идэвхгүй'}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs uppercase text-muted-foreground">Орчин</dt><dd className="font-semibold">{c?.environment ?? '—'}</dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Хувилбар</dt><dd className="font-semibold">{c ? `v${c.version}` : '—'}</dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Харилцагч</dt><dd className="font-semibold">{c?.merchantName ?? '—'}</dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Валют</dt><dd className="font-semibold">{c?.currency ?? '—'}</dd></div>
        </dl>
        <hr />
        <EndpointBox url={c?.callbackUrl ?? ''}>Нэхэмжлэх бүрт автоматаар дамжина. Тохиргоог “QPay тохиргоо” табаас өөрчилнө.</EndpointBox>
      </Panel>
      <Panel className="space-y-4">
        <h2 className="text-lg font-black uppercase">Төлбөрийн дүрэм</h2>
        <Toggle label="Төлбөр шаардах" hint="Унтраавал нэвтэрсэн бүх хэрэглэгч үнэгүй үзнэ." checked={f.paymentRequired} onChange={(v) => setForm({ ...f, paymentRequired: v })} />
        <Field label="Валют" hint="quickqpaypackv2 зөвхөн MNT дэмждэг."><Input maxLength={3} value={f.currency} onChange={(e) => setForm({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label="Нэхэмжлэхийн хүчинтэй хугацаа (минут)"><NumberInput min={5} value={f.paymentExpiryMinutes} onChange={(v) => setForm({ ...f, paymentExpiryMinutes: v })} /></Field>
        <div className="text-sm text-muted-foreground">Одоогийн үнэ: {f.plans.filter((p) => p.enabled).map((p) => `${p.name} ${money(p.price, f.currency)}`).join(', ')}</div>
        <SaveRow msg={msg} busy={busy} save={() => void save()} />
      </Panel>
    </div>
  );
}

interface Check { name: string; ok: boolean; message: string }
const emptyQPay = { environment: 'sandbox' as 'sandbox' | 'production', merchantName: '', baiguullagiinId: '', salbariinId: '', dansniiDugaar: '', callbackUrl: '', currency: 'MNT', enabled: false };

export function QPayTab() {
  const { data, error, reload } = useApi<QPayInfo>('/api/admin/settings/qpay');
  const [f, setF] = useState(emptyQPay);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const { msg, busy, run } = useSaver();
  useEffect(() => {
    if (data?.current) {
      const c = data.current;
      setF({ environment: c.environment, merchantName: c.merchantName, baiguullagiinId: c.baiguullagiinId, salbariinId: c.salbariinId, dansniiDugaar: c.dansniiDugaar, callbackUrl: c.callbackUrl, currency: c.currency, enabled: c.enabled });
    }
  }, [data]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  const locked = !data.canEditProduction && (f.environment === 'production' || data.current?.environment === 'production');
  const envMismatch = data.server.environment !== f.environment;
  const test = () => run(async () => {
    setChecks(null);
    const r = await api<Check>('/api/admin/settings/qpay/test', { body: f }).catch((e: ApiClientError) => e.details as Check);
    setChecks([r]);
  }, 'Шалгалт дууслаа.');
  const verify = () => run(async () => {
    setChecks(null);
    setChecks((await api<{ checks: Check[] }>('/api/admin/settings/qpay/verify', { body: f })).checks);
  }, 'Шалгалт дууслаа.');
  const save = () => run(async () => {
    setChecks(null);
    try {
      const r = await api<{ checks: Check[] }>('/api/admin/settings/qpay', { body: f });
      if (r.checks.length) setChecks(r.checks);
    } catch (e) {
      if (Array.isArray((e as ApiClientError).details)) setChecks((e as ApiClientError).details as Check[]);
      throw e;
    }
    await reload();
  }, 'Шинэ хувилбар хадгалагдлаа.');

  return (
    <div className="space-y-6">
      <Notice tone="warning">
        <KeyRound className="mr-1 inline size-4" />
        Нэвтрэх мэдээллийг <b>quickqpaypackv2</b> сан өөрөө удирддаг тул энд оруулах боломжгүй. Энд зөвхөн сан руу дамжуулах харилцагчийн лавлагаа (QpayKhariltsagch) тохируулна.
      </Notice>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-black uppercase">QPay тохиргоо</h2><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Одоогийн: {data.current ? `v${data.current.version}` : 'хадгалаагүй'}</p></div>
            <Switch aria-label="QPay идэвхтэй" checked={f.enabled} disabled={locked} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
          </div>
          {locked && <Notice tone="danger">Production тохиргоог зөвхөн Superadmin өөрчилнө.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Орчин" hint={envMismatch ? `Сервер одоо ${data.server.environment ?? 'тодорхойгүй'} руу заасан тул идэвхжүүлэх боломжгүй.` : 'Серверийн QPAY_MERCHANT_SERVER-тэй таарч байна.'}>
              <Select value={f.environment} disabled={locked} onChange={(e) => setF({ ...f, environment: e.target.value as 'sandbox' | 'production' })}><option value="sandbox">Sandbox</option><option value="production">Production</option></Select>
            </Field>
            <Field label="Харилцагчийн нэр"><Input value={f.merchantName} disabled={locked} onChange={(e) => setF({ ...f, merchantName: e.target.value })} /></Field>
            <Field label="Байгууллагын ID (baiguullagiinId)"><Input value={f.baiguullagiinId} disabled={locked} onChange={(e) => setF({ ...f, baiguullagiinId: e.target.value })} /></Field>
            <Field label="Салбарын ID (salbariinId)"><Input value={f.salbariinId} disabled={locked} onChange={(e) => setF({ ...f, salbariinId: e.target.value })} /></Field>
            <Field label="Дансны дугаар" hint="Хоосон бол салбарын бүх данс."><Input value={f.dansniiDugaar} disabled={locked} onChange={(e) => setF({ ...f, dansniiDugaar: e.target.value })} /></Field>
            <Field label="Валют"><Input value={f.currency} disabled /></Field>
          </div>
          <Field label="Callback URL" hint="Жишээ: https://zzzcinema.mn/api/payments/qpay/callback"><Input type="url" value={f.callbackUrl} disabled={locked} onChange={(e) => setF({ ...f, callbackUrl: e.target.value })} /></Field>
          <Feedback msg={msg} />
          {checks && (
            <ul className="space-y-1.5 rounded-lg border p-3 text-sm">
              {checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <span><b>{c.name}:</b> {c.message}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || locked} onClick={() => void save()}>Тохиргоо хадгалах</Button>
            <Button variant="outline" disabled={busy} onClick={() => void test()}>Холболт шалгах</Button>
            <Button variant="outline" disabled={busy} onClick={() => void verify()}><ShieldCheck />Харилцагч шалгах</Button>
          </div>
        </Panel>
        <Panel className="space-y-3">
          <h2 className="font-bold">Хувилбарууд</h2>
          <p className="text-xs text-muted-foreground">Нэхэмжлэх бүр үүссэн хувилбараа хадгална. Төлбөр холбогдсон хувилбар устгагдахгүй.</p>
          <ul className="divide-y text-sm">
            {data.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                <span><b>v{v.version}</b> · {v.environment} · {v.merchantName}<br /><span className="text-xs text-muted-foreground">{dateTime(v.createdAt)}</span></span>
                <span className="flex gap-1">{v.isCurrent && <Badge tone="primary">Одоогийн</Badge>}{v.enabled && <Badge tone="success">Идэвхтэй</Badge>}</span>
              </li>
            ))}
            {!data.versions.length && <li className="py-2 text-muted-foreground">Хувилбар алга.</li>}
          </ul>
        </Panel>
      </div>
      <MerchantPanel baiguullagiinId={f.baiguullagiinId} canEdit={data.canEditProduction} />
    </div>
  );
}

interface Account { account_bank_code: string; account_number: string; account_name: string; qpayShimtgelTurul: boolean }
interface Branch { salbariinId: string; salbariinNer: string; qpayShimtgelTurul: boolean; bank_accounts: Account[] }
interface Merchant { type: 'COMPANY' | 'PERSON'; baiguullagiinId: string; register_number: string; name?: string; first_name?: string; last_name?: string; mcc_code: string; city: string; district: string; address: string; phone: string; email: string; salbaruud: Branch[]; hasMerchantTrue?: boolean; hasMerchantFalse?: boolean }
const blankMerchant = (id: string): Merchant => ({ type: 'COMPANY', baiguullagiinId: id, register_number: '', name: '', mcc_code: '', city: '', district: '', address: '', phone: '', email: '', salbaruud: [] });

// Багцын QpayKhariltsagch бүтцийг засах хэсэг. Хадгалахад qpayKhariltsagchUusgey дуудагдаж QPay-д бүртгэгдэнэ.
function MerchantPanel({ baiguullagiinId, canEdit }: { baiguullagiinId: string; canEdit: boolean }) {
  const { data, reload } = useApi<{ merchant: Merchant | null }>(baiguullagiinId ? `/api/admin/settings/qpay/merchant?baiguullagiinId=${encodeURIComponent(baiguullagiinId)}` : null);
  const [m, setM] = useState<Merchant | null>(null);
  const { msg, busy, run } = useSaver();
  useEffect(() => { setM(data?.merchant ?? (baiguullagiinId ? blankMerchant(baiguullagiinId) : null)); }, [data, baiguullagiinId]);
  if (!m) return null;
  const set = (p: Partial<Merchant>) => setM({ ...m, ...p });
  const setBranch = (i: number, p: Partial<Branch>) => set({ salbaruud: m.salbaruud.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const setAcc = (i: number, k: number, p: Partial<Account>) => setBranch(i, { bank_accounts: m.salbaruud[i].bank_accounts.map((a, j) => (j === k ? { ...a, ...p } : a)) });
  const save = () => run(async () => {
    if (!window.confirm('Энэ мэдээллийг QPay-д бодитоор илгээж бүртгэнэ. Үргэлжлүүлэх үү?')) throw new Error('Цуцлагдлаа.');
    const { hasMerchantTrue: _t, hasMerchantFalse: _f, ...body } = m;
    await api('/api/admin/settings/qpay/merchant', { body });
    await reload();
  }, 'Харилцагч бүртгэгдлээ.');
  const text = (label: string, k: 'register_number' | 'name' | 'first_name' | 'last_name' | 'mcc_code' | 'city' | 'district' | 'address' | 'phone' | 'email') => (
    <Field label={label}><Input value={m[k] ?? ''} disabled={!canEdit} onChange={(e) => set({ [k]: e.target.value })} /></Field>
  );
  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black uppercase">QPay харилцагч</h2>
        <div className="flex gap-1">
          <Badge tone={m.hasMerchantFalse ? 'success' : 'neutral'}>merchant_idFalse {m.hasMerchantFalse ? '✓' : '—'}</Badge>
          <Badge tone={m.hasMerchantTrue ? 'success' : 'neutral'}>merchant_idTrue {m.hasMerchantTrue ? '✓' : '—'}</Badge>
        </div>
      </div>
      {!canEdit && <Notice>Зөвхөн Superadmin засна. Дансны дугаарууд далдлагдсан.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Төрөл"><Select value={m.type} disabled={!canEdit} onChange={(e) => set({ type: e.target.value as Merchant['type'] })}><option value="COMPANY">Байгууллага</option><option value="PERSON">Хувь хүн</option></Select></Field>
        {text('Регистр', 'register_number')}
        {m.type === 'COMPANY' ? text('Нэр', 'name') : <>{text('Овог', 'last_name')}{text('Нэр', 'first_name')}</>}
        {text('MCC код', 'mcc_code')}{text('Хот', 'city')}{text('Дүүрэг', 'district')}{text('Хаяг', 'address')}{text('Утас', 'phone')}{text('И-мэйл', 'email')}
      </div>
      {m.salbaruud.map((b, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <Field label="Салбарын ID"><Input value={b.salbariinId} disabled={!canEdit} onChange={(e) => setBranch(i, { salbariinId: e.target.value })} /></Field>
            <Field label="Салбарын нэр"><Input value={b.salbariinNer} disabled={!canEdit} onChange={(e) => setBranch(i, { salbariinNer: e.target.value })} /></Field>
            <label className="flex h-10 items-center gap-2 text-xs font-semibold">Шимтгэлтэй<Switch checked={b.qpayShimtgelTurul} disabled={!canEdit} onCheckedChange={(v) => setBranch(i, { qpayShimtgelTurul: v })} /></label>
            {canEdit && <Button variant="ghost" size="icon" aria-label="Салбар устгах" onClick={() => set({ salbaruud: m.salbaruud.filter((_, j) => j !== i) })}><Trash2 /></Button>}
          </div>
          {b.bank_accounts.map((a, k) => (
            <div key={k} className="grid items-end gap-3 rounded-md bg-muted p-2 sm:grid-cols-[7rem_1fr_1fr_auto_auto]">
              <Field label="Банкны код"><Input value={a.account_bank_code} disabled={!canEdit} onChange={(e) => setAcc(i, k, { account_bank_code: e.target.value })} /></Field>
              <Field label="Дансны дугаар"><Input value={a.account_number} disabled={!canEdit} onChange={(e) => setAcc(i, k, { account_number: e.target.value })} /></Field>
              <Field label="Эзэмшигч"><Input value={a.account_name} disabled={!canEdit} onChange={(e) => setAcc(i, k, { account_name: e.target.value })} /></Field>
              <label className="flex h-10 items-center gap-2 text-xs font-semibold">Шимтгэлтэй<Switch checked={a.qpayShimtgelTurul} disabled={!canEdit} onCheckedChange={(v) => setAcc(i, k, { qpayShimtgelTurul: v })} /></label>
              {canEdit && <Button variant="ghost" size="icon" aria-label="Данс устгах" onClick={() => setBranch(i, { bank_accounts: b.bank_accounts.filter((_, j) => j !== k) })}><Trash2 /></Button>}
            </div>
          ))}
          {canEdit && <Button variant="outline" size="sm" onClick={() => setBranch(i, { bank_accounts: [...b.bank_accounts, { account_bank_code: '', account_number: '', account_name: '', qpayShimtgelTurul: false }] })}><Plus />Данс нэмэх</Button>}
        </div>
      ))}
      <Feedback msg={msg} />
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => set({ salbaruud: [...m.salbaruud, { salbariinId: '', salbariinNer: '', qpayShimtgelTurul: false, bank_accounts: [] }] })}><Plus />Салбар нэмэх</Button>
          <Button disabled={busy} onClick={() => void save()}>QPay-д бүртгэх</Button>
        </div>
      )}
    </Panel>
  );
}

interface SmsView { configured: boolean; version: number; provider: 'http' | 'mock'; apiUrl: string; senderId: string; enabled: boolean; otpExpiryMinutes: number; resendCooldownSeconds: number; maxAttempts: number; apiKeyMasked: string; apiSecretMasked: string }

export function SmsTab() {
  const { data, error, reload } = useApi<SmsView>('/api/admin/settings/sms');
  const [f, setF] = useState<(SmsView & { apiKey: string; apiSecret: string }) | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const { msg, busy, run } = useSaver();
  useEffect(() => { if (data) setF({ ...data, apiKey: '', apiSecret: '' }); }, [data]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!f) return <Skeleton className="h-96" />;
  const save = () => run(async () => {
    await api('/api/admin/settings/sms', { body: { provider: f.provider, apiUrl: f.apiUrl, senderId: f.senderId, enabled: f.enabled, otpExpiryMinutes: f.otpExpiryMinutes, resendCooldownSeconds: f.resendCooldownSeconds, maxAttempts: f.maxAttempts, ...(f.apiKey ? { apiKey: f.apiKey } : {}), ...(f.apiSecret ? { apiSecret: f.apiSecret } : {}) } });
    await reload();
  });
  const test = () => run(() => api('/api/admin/settings/sms/test', { body: { phone: testPhone } }), 'Туршилтын SMS илгээгдлээ.');
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel className="space-y-4">
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-accent text-primary"><MessageSquare /></span>
          <div className="flex-1"><h2 className="text-lg font-black uppercase">SMS үйлчилгээ</h2><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.configured ? `v${f.version}` : 'Тохируулаагүй'}</p></div>
          <Switch aria-label="SMS идэвхтэй" checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
        </div>
        <Field label="Үйлчилгээ үзүүлэгч"><Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as SmsView['provider'] })}><option value="http">HTTP API</option><option value="mock">Mock (зөвхөн хөгжүүлэлт)</option></Select></Field>
        <Field label="API URL"><Input type="url" value={f.apiUrl} onChange={(e) => setF({ ...f, apiUrl: e.target.value })} /></Field>
        <Field label="API Key" hint={f.apiKeyMasked ? 'Хадгалагдсан. Хоосон үлдээвэл өөрчлөгдөхгүй.' : undefined}><Input type="password" autoComplete="off" placeholder={f.apiKeyMasked || 'API Key'} value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} /></Field>
        <Field label="API Secret" hint={f.apiSecretMasked ? 'Хадгалагдсан. Хоосон үлдээвэл өөрчлөгдөхгүй.' : undefined}><Input type="password" autoComplete="off" placeholder={f.apiSecretMasked || 'API Secret'} value={f.apiSecret} onChange={(e) => setF({ ...f, apiSecret: e.target.value })} /></Field>
        <Field label="Sender ID"><Input value={f.senderId} onChange={(e) => setF({ ...f, senderId: e.target.value })} /></Field>
      </Panel>
      <div className="space-y-6">
        <Panel className="space-y-4">
          <h2 className="font-bold">OTP тохиргоо</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Хүчинтэй (мин)"><NumberInput min={1} value={f.otpExpiryMinutes} onChange={(v) => setF({ ...f, otpExpiryMinutes: v })} /></Field>
            <Field label="Дахин илгээх (сек)"><NumberInput min={0} value={f.resendCooldownSeconds} onChange={(v) => setF({ ...f, resendCooldownSeconds: v })} /></Field>
            <Field label="Оролдлого"><NumberInput min={1} value={f.maxAttempts} onChange={(v) => setF({ ...f, maxAttempts: v })} /></Field>
          </div>
          <Feedback msg={msg} />
          <Button disabled={busy} onClick={() => void save()}>Хадгалах</Button>
        </Panel>
        <Panel className="space-y-3">
          <h2 className="font-bold">SMS туршилт</h2>
          <p className="text-xs text-muted-foreground">Хадгалсан тохиргоогоор жинхэнэ SMS илгээнэ.</p>
          <div className="flex gap-2"><Input aria-label="Утас" placeholder="9911 2233" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} /><Button variant="outline" disabled={busy || !testPhone || !f.configured} onClick={() => void test()}>Илгээх</Button></div>
        </Panel>
      </div>
    </div>
  );
}

const RES = [2160, 1440, 1080, 720, 480, 360];
export function VideoTab({ entry, roots, reload }: { entry: Entry<Video>; roots: string[]; reload: () => Promise<void> }) {
  const { user } = useApp();
  const { form: f, setForm, save, msg, busy } = useSection(entry, 'video', reload);
  return (
    <Panel className="max-w-3xl space-y-4">
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
      <Notice>OTP-н хугацаа, оролдлого, дахин илгээх хугацааг “SMS тохиргоо” табаас удирдана.</Notice>
      <SaveRow msg={msg} busy={busy} save={() => void save()} />
    </Panel>
  );
}

export function AdminsTab() {
  const { user } = useApp();
  const { data, error, reload } = useApi<{ items: PublicUser[] }>(user?.role === 'superadmin' ? '/api/admin/admins' : null);
  const [f, setF] = useState({ phone: '', password: '', name: '', role: 'admin' });
  const { msg, busy, run } = useSaver();
  if (user?.role !== 'superadmin') return <Notice tone="warning">Админ удирдлага зөвхөн Superadmin-д нээлттэй.</Notice>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const add = () => run(async () => {
    await api('/api/admin/admins', { body: { phone: f.phone, name: f.name, role: f.role, ...(f.password ? { password: f.password } : {}) } });
    setF({ phone: '', password: '', name: '', role: 'admin' });
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
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Утас"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Нэр"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Нууц үг" hint="Бүртгэлтэй хэрэглэгчид шаардлагагүй."><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Эрх"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="admin">Admin</option><option value="superadmin">Superadmin</option></Select></Field>
        </div>
        <Feedback msg={msg} />
        <Button disabled={busy || !f.phone} onClick={() => void add()}>Нэмэх</Button>
      </Panel>
      <Table head={['Утас', 'Нэр', 'Эрх', 'Сүүлд нэвтэрсэн']}>
        {data?.items.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-3 font-semibold">{u.phone}</td><td className="px-4 py-3">{u.name}</td>
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
