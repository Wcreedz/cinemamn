'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  // Хариу дарааллаа алдаж ирвэл зөвхөн хамгийн сүүлийн хүсэлтийнх хэрэглэгдэнэ.
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    if (!path) { setData(null); setError(null); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (request !== latest.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (request !== latest.current) return;
      setError((e as Error).message);
    }
    setLoading(false);
  }, [path]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}
