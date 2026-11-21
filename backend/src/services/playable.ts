// Шинэ файл боловсруулагдаж эсвэл бүтэлгүйтсэн ч хуучин HLS дискэнд бүтэн байгаа.
// Тоглуулах, худалдах аль алинд хэрэглэдэг тул бусад service-ээс хамааралгүй тусдаа модуль.
export const isPlayable = (movie: { videoStatus?: string | null; hlsPath?: string | null }) => movie.videoStatus === 'ready' || !!movie.hlsPath;
