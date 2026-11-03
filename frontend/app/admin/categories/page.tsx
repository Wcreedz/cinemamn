'use client';
import { useState } from 'react';
import type { Category } from '@mongolflix/shared';
import { ImageField, uploadImageFile } from '@/components/admin/image-field';
import { Field, PageHeader, Panel, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const IMAGE_MAX_SIDE = 800;
const empty = { name: '', image: '', isActive: true };

export default function AdminCategories() {
  const { data, error, reload } = useApi<{ items: Category[] }>('/api/admin/categories');
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-64" />;
  const reset = () => { setF(empty); setFile(null); setEditing(null); setMsg(null); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      let id = editing;
      if (id) await api(`/api/admin/categories/${id}`, { method: 'PUT', body: f });
      else {
        id = (await api<{ id: string }>('/api/admin/categories', { body: f })).id;
        // Зураг бүтэлгүйтвэл дахин дарахад шинэ ангилал биш, энэ нь шинэчлэгдэнэ.
        setEditing(id);
      }
      if (file) await uploadImageFile(`/api/admin/categories/${id}/image`, file, IMAGE_MAX_SIDE);
      reset();
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  const del = async (c: Category) => {
    try { await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); await reload(); } catch (err) { setMsg((err as Error).message); }
  };
  return (
    <>
      <PageHeader title="Ангилал" />
      <Panel className="mb-6">
        <form onSubmit={(e) => void save(e)} className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <ImageField label="Зураг" hint="Заавал биш. Хамгийн тохиромжтой нь 600×340." src={f.image} file={file} disabled={busy} previewClass="h-28 w-full" onPick={setFile} onRemove={() => { setFile(null); setF({ ...f, image: '' }); }} />
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Нэр"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <label className="flex h-10 items-center gap-2 text-sm">Идэвхтэй<Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /></label>
            </div>
            {msg && <Notice tone="danger">{msg}</Notice>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{busy ? 'Хадгалж байна…' : editing ? 'Хадгалах' : 'Нэмэх'}</Button>
              {editing && <Button type="button" variant="outline" disabled={busy} onClick={reset}>Болих</Button>}
            </div>
          </div>
        </form>
      </Panel>
      <Table head={['Зураг', 'Нэр', 'Идэвхтэй', '']}>
        {data.items.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-3">{c.image ? <img src={c.image} alt="" className="h-10 w-16 rounded object-cover" /> : <span className="text-muted-foreground">Зураггүй</span>}</td>
            <td className="px-4 py-3 font-semibold">{c.name}</td><td className="px-4 py-3">{c.isActive ? 'Тийм' : 'Үгүй'}</td>
            <td className="space-x-2 px-4 py-3 text-right">
              <Button size="sm" variant="outline" onClick={() => { setEditing(c.id); setFile(null); setMsg(null); setF({ name: c.name, image: c.image ?? '', isActive: c.isActive }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Засах</Button>
              <Confirm question={`"${c.name}" ангиллыг устгах уу?`} onConfirm={() => void del(c)}>
                <Button size="sm" variant="ghost" aria-label={`${c.name} устгах`}>Устгах</Button>
              </Confirm>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
