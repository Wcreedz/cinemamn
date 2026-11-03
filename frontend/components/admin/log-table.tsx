'use client';
import { Table } from '@/components/admin/ui';
import { dateTime } from '@/lib/utils';

export interface LogRow { _id: string; action: string; targetType?: string; metadata?: unknown; ipAddress?: string; createdAt: string; adminId?: { email?: string; phone?: string; name?: string } }

export function LogTable({ items }: { items: LogRow[] }) {
  return (
    <Table head={['Огноо', 'Админ', 'Үйлдэл', 'IP', 'Дэлгэрэнгүй']}>
      {items.map((l) => (
        <tr key={l._id} className="align-top">
          <td className="whitespace-nowrap px-4 py-3">{dateTime(l.createdAt)}</td>
          <td className="px-4 py-3">{l.adminId?.email ?? l.adminId?.phone}</td>
          <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
          <td className="px-4 py-3 text-xs">{l.ipAddress}</td>
          <td className="px-4 py-3">{l.metadata ? <details><summary className="cursor-pointer text-xs text-primary">Харах</summary><pre className="mt-1 max-w-xl overflow-x-auto text-xs">{JSON.stringify(l.metadata, null, 1)}</pre></details> : null}</td>
        </tr>
      ))}
    </Table>
  );
}
