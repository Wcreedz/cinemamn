'use client';
import { useState } from 'react';

export const PAGE_SIZES = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;
const STORAGE_KEY = 'mf_page_size';

// Сонгосон хэмжээ бүх жагсаалтад хамаарна. localStorage хаалттай хөтөчид зүгээр л санахгүй.
function storedPageSize() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return PAGE_SIZES.includes(saved) ? saved : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function usePagination() {
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(storedPageSize);
  // Хэмжээ өөрчлөгдөхөд хуучин хуудасны дугаар байхгүй хуудас руу заах тул эхэнд буцна.
  const setLimit = (next: number) => {
    setLimitState(next);
    setPage(1);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* зөвхөн энэ удаад хүчинтэй */ }
  };
  return { page, limit, setPage, setLimit, query: `page=${page}&limit=${limit}` };
}

export type Pager = Pick<ReturnType<typeof usePagination>, 'setPage' | 'setLimit'>;
