const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya',
};
const MAX_LENGTH = 100;
const FALLBACK = 'kino';

export function toSlug(title: string) {
  const latin = [...title.toLowerCase()].map((c) => CYRILLIC_TO_LATIN[c] ?? c).join('');
  return latin.replace(/[^a-z0-9]+/g, '-').slice(0, MAX_LENGTH).replace(/^-+|-+$/g, '') || FALLBACK;
}
