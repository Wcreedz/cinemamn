// Нүүр хуудасны анхны хэсгүүдэд тохирох ангиллуудыг үүсгэнэ. Давтаж ажиллуулахад аюулгүй.
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { Category } from '../models';

const CATEGORIES = [
  ['mongol', 'Монгол кино'], ['adventure', 'Адал явдалт'], ['comedy', 'Инээдмийн'], ['drama', 'Драм'],
  ['horror', 'Аймшиг'], ['action', 'Тулаант'], ['romance', 'Романтик'], ['family', 'Гэр бүл'],
] as const;

async function main() {
  await connectDb();
  await Promise.all(CATEGORIES.map(([slug, name], i) => Category.updateOne({ slug }, { $setOnInsert: { slug, name, sortOrder: i, isActive: true } }, { upsert: true })));
  console.info(`${CATEGORIES.length} ангилал бэлэн боллоо.`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
