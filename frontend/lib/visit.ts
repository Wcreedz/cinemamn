import { api } from '@/lib/api';

const STORAGE_KEY = 'mf_visitor';

// crypto.randomUUID зөвхөн HTTPS дээр ажилладаг тул getRandomValues ашиглана.
const newVisitorId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function visitorId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    const id = newVisitorId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage хаалттай хөтөч: хуудас ачаалах бүрт шинэ зочин болж тоологдоно.
    return newVisitorId();
  }
}

// Статистикийн алдаа сайт үзэхэд нөлөөлөх ёсгүй.
export function reportVisit() {
  api('/api/visits', { body: { visitorId: visitorId() } }).catch(() => undefined);
}
