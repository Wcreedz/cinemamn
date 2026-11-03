import crypto from 'crypto';
import type { Request, Response } from 'express';
import { promises as fs } from 'fs';
import multer from 'multer';
import path from 'path';
import { badRequest } from '../utils/errors';
import { VideoConfigurationService } from './videoConfiguration.service';

// Ангилал, слайдын зураг backdrops/ дотор байна: Nginx нь /media/posters, /media/backdrops-ийг
// л гаргадаг тул шинэ төрөл нэмэхэд серверийн тохиргоо өөрчлөх шаардлагагүй.
const FOLDERS = { poster: 'posters', backdrop: 'backdrops', category: 'backdrops/categories', banner: 'backdrops/banners' } as const;
export type ImageKind = keyof typeof FOLDERS;

// Зөвхөн энэ үйлчилгээний үүсгэсэн хэлбэрийн зам: "..", гадны хаяг хэзээ ч дискний файлд хүрэхгүй.
const OWN_IMAGE = /^(?:https?:\/\/[^/]+)?\/media\/((?:posters|backdrops(?:\/categories|\/banners)?)\/[\w-]+\.(?:jpg|png|webp))$/;
const ownImage = (url?: string | null) => (url ? OWN_IMAGE.exec(url)?.[1] ?? null : null);

// Гарчгаас биш файлын эхний байтаас зургийн төрлийг тодорхойлно.
function imageExt(buf: Buffer) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

export const MediaService = {
  async saveImage(req: Request, res: Response, kind: ImageKind) {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('image');
    await new Promise<void>((resolve, reject) => upload(req, res, (err) => (err ? reject(err) : resolve())));
    if (!req.file) throw badRequest('Зураг сонгоно уу.');
    const ext = imageExt(req.file.buffer);
    if (!ext) throw badRequest('Зөвхөн JPG, PNG, WEBP зураг байршуулна.');
    const { storageRoot } = await VideoConfigurationService.get();
    const folder = FOLDERS[kind];
    await fs.mkdir(path.join(storageRoot, folder), { recursive: true });
    const name = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(storageRoot, folder, name), req.file.buffer);
    // Харьцангуй зам: домэйн солигдох, HTTPS руу шилжихэд зураг эвдрэхгүй.
    return `/media/${folder}/${name}`;
  },

  // Бүтэн хаяг, харьцангуй зам нь нэг файлыг заавал устгахгүй: файлаар нь харьцуулна.
  async removeUnused(before: (string | null | undefined)[], after: (string | null | undefined)[] = []) {
    const kept = new Set(after.map(ownImage));
    const unused = [...new Set(before.map(ownImage))].filter((file): file is string => !!file && !kept.has(file));
    if (!unused.length) return;
    const { storageRoot } = await VideoConfigurationService.get();
    await Promise.all(unused.map((file) => fs.rm(path.join(storageRoot, file), { force: true })));
  },
};

// Зураг заагаагүй бол хөндөхгүй, хоосон утга нь "зураггүй болгох" гэсэн үг.
export function withoutEmpty<T extends object>(input: T, fields: (keyof T & string)[]) {
  const $set = { ...input };
  const $unset: Record<string, 1> = {};
  for (const field of fields) {
    if ($set[field] === '') {
      delete $set[field];
      $unset[field] = 1;
    }
  }
  return { $set, ...(Object.keys($unset).length ? { $unset } : {}) };
}
