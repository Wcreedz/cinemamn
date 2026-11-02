'use client';
import { useState } from 'react';
import type { Category } from '@mongolflix/shared';
import { Field, NumberInput, PageHeader, Panel, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const empty = { name: '', slug: '', sortOrder: 0, isActive: true };

export default function AdminCategories() {
  const { data, error, reload } = useApi<{ items: Category[] }>('/api/admin/categories');
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-64" />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await (editing ? api(`/api/admin/categories/${editing}`, { method: 'PUT', body: f }) : api('/api/admin/categories', { body: f }));
      setF(empty); setEditing(null);
      await reload();
    } catch (err) { setMsg((err as Error).message); }
  };
  const del = async (c: Category) => {
    if (!window.confirm(`"${c.name}" ангиллыг устгах уу?`)) return;
    try { await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); await reload(); } catch (err) { setMsg((err as Error).message); }
  };
  return (
    <>
      <PageHeader title="Ангилал" />
      <Panel className="mb-6">
        <form onSubmit={(e) => void save(e)} className="grid gap-4 sm:grid-cols-[1fr_1fr_6rem_auto_auto] sm:items-end">
          <Field label="Нэр"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Slug"><Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
          <Field label="Дараалал"><NumberInput value={f.sortOrder} onChange={(v) => setF({ ...f, sortOrder: v })} /></Field>
          <label className="flex h-10 items-center gap-2 text-sm">Идэвхтэй<Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /></label>
          <Button type="submit">{editing ? 'Хадгалах' : 'Нэмэх'}</Button>
        </form>
        {msg && <Notice tone="danger" className="mt-3">{msg}</Notice>}
      </Panel>
      <Table head={['Нэр', 'Slug', 'Дараалал', 'Идэвхтэй', '']}>
        {data.items.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-3 font-semibold">{c.name}</td><td className="px-4 py-3">{c.slug}</td><td className="px-4 py-3">{c.sortOrder}</td><td className="px-4 py-3">{c.isActive ? 'Тийм' : 'Үгүй'}</td>
            <td className="space-x-2 px-4 py-3 text-right">
              <Button size="sm" variant="outline" onClick={() => { setEditing(c.id); setF({ name: c.name, slug: c.slug, sortOrder: c.sortOrder, isActive: c.isActive }); }}>Засах</Button>
              <Button size="sm" variant="ghost" onClick={() => void del(c)}>Устгах</Button>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
