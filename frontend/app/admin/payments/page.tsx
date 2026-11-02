'use client';
import { useState } from 'react';
import type { Paginated, PaymentView } from '@mongolflix/shared';
import { PageHeader, Pager, Table } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/misc';
import { useApp } from '@/components/providers';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/utils';

type Row = PaymentView & { phone?: string; invoiceId?: string; verificationNote?: string };
const TONE = { paid: 'success', pending: 'warning', failed: 'danger', expired: 'neutral', refunded: 'neutral' } as const;

export default function AdminPayments() {
  const { user } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const query = new URLSearchParams({ page: String(page), ...(q ? { q } : {}), ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to: `${to}T23:59:59` } : {}) });
  const { data, error, loading, reload } = useApi<Paginated<Row>>(`/api/admin/payments?${query}`);

  const verify = async (p: Row) => {
    setMsg(null);
    try {
      const r = await api<{ outcome: string }>(`/api/admin/payments/${p.id}/verify`, { method: 'POST' });
      const labels: Record<string, string> = { paid: 'Төлбөр баталгаажиж эрх идэвхжлээ.', already_paid: 'Аль хэдийн боловсруулагдсан.', pending: 'QPay дээр төлөгдөөгүй байна.', rejected: 'Дүн эсвэл нэхэмжлэх таарахгүй тул татгалзав.', unverifiable: 'QPay хариунд дүн алга: гараар шалгана уу.' };
      setMsg({ ok: r.outcome === 'paid' || r.outcome === 'already_paid', text: `${p.orderNumber}: ${labels[r.outcome] ?? r.outcome}` });
      await reload();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const refund = async (p: Row) => {
    const note = window.prompt(`${p.orderNumber} төлбөрийг буцаасан гэж бүртгэх үү? Холбогдох эрх цуцлагдана. Мөнгө буцаалтыг QPay/банкаар тусад нь хийнэ. Шалтгаан:`);
    if (!note?.trim()) return;
    try { await api(`/api/admin/payments/${p.id}/refund`, { body: { note } }); setMsg({ ok: true, text: 'Буцаалт бүртгэгдлээ.' }); await reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };

  return (
    <>
      <PageHeader title="Төлбөрүүд" subtitle="Гүйлгээ хайх, QPay-с шалгах, буцаалт бүртгэх" />
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Input aria-label="Хайх" placeholder="Утас, захиалга, нэхэмжлэх" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <Select aria-label="Төлөв" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Бүх төлөв</option><option value="pending">Хүлээгдэж буй</option><option value="paid">Төлөгдсөн</option><option value="failed">Амжилтгүй</option><option value="expired">Хугацаа дууссан</option><option value="refunded">Буцаагдсан</option>
        </Select>
        <Input aria-label="Эхлэх огноо" type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        <Input aria-label="Дуусах огноо" type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
      </div>
      {msg && <Notice tone={msg.ok ? 'success' : 'danger'} className="mb-4">{msg.text}</Notice>}
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : !data?.items.length ? <EmptyState title="Төлбөр олдсонгүй" /> : (
        <>
          <Table head={['Захиалга', 'Утас', 'Дүн', 'Төлөв', 'Огноо', '']}>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3"><p className="font-mono text-xs">{p.orderNumber}</p><p className="max-w-52 truncate text-xs text-muted-foreground" title={p.invoiceId}>{p.invoiceId}</p></td>
                <td className="px-4 py-3">{p.phone}</td>
                <td className="px-4 py-3 font-semibold">{money(p.amount, p.currency)}</td>
                <td className="px-4 py-3"><Badge tone={TONE[p.status]}>{p.status}</Badge>{p.failureReason && <p className="mt-1 text-xs text-destructive">{p.failureReason}</p>}{p.verificationNote && <p className="mt-1 max-w-52 text-xs text-muted-foreground">{p.verificationNote}</p>}</td>
                <td className="px-4 py-3">{dateTime(p.createdAt)}</td>
                <td className="space-x-1 whitespace-nowrap px-4 py-3 text-right">
                  {(p.status === 'pending' || p.status === 'expired') && <Button size="sm" variant="outline" onClick={() => void verify(p)}>QPay-с шалгах</Button>}
                  {p.status === 'paid' && user?.role === 'superadmin' && <Button size="sm" variant="ghost" onClick={() => void refund(p)}>Буцаалт</Button>}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
