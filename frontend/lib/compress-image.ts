const QUALITY = 0.85;
const SMALL_ENOUGH_BYTES = 500 * 1024;

// Утасны зураг хэдэн MB байдаг: дэлгэцэд харагдах хэмжээ хүртэл багасгаж байршуулах, үзэх хурдыг нэмнэ.
// JPEG тунгалаг хэсгийг хар болгодог тул лого, favicon-д type-г 'image/png' өгнө.
export async function compressImage(file: File, maxSide: number, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Хөтөч задалж чадахгүй формат: шалгалтыг сервер хийнэ.
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) { bitmap.close(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg'), { type });
}
