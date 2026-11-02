// Анхны Superadmin үүсгэнэ. Нууц үг кодод бичигдэхгүй, shell түүхэд үлдэхгүйн тулд stdin-ээс уншина.
// Хэрэглээ: npm run admin:bootstrap -- +97699112233 "Нэр"
import readline from 'readline';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { User } from '../models';
import { hashPassword } from '../services/auth.service';
import { normalizePhone } from '../utils/phone';

async function readPassword() {
  if (process.env.ADMIN_BOOTSTRAP_PASSWORD) return process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  const answer = await new Promise<string>((resolve) => {
    rl.question('Нууц үг (дор хаяж 12 тэмдэгт): ', resolve);
    out._writeToOutput = () => undefined;
  });
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function main() {
  const [phoneArg, name = 'Superadmin'] = process.argv.slice(2);
  if (!phoneArg) throw new Error('Хэрэглээ: npm run admin:bootstrap -- <утас> [нэр]');
  const phone = normalizePhone(phoneArg);
  await connectDb();
  if (await User.exists({ role: 'superadmin' })) throw new Error('Superadmin аль хэдийн байна. Нэмэлт админыг /admin/settings дээрээс үүсгэнэ үү.');
  const password = await readPassword();
  if (password.length < 12) throw new Error('Нууц үг дор хаяж 12 тэмдэгт байх ёстой.');
  const passwordHash = await hashPassword(password);
  await User.findOneAndUpdate({ phone }, { $set: { role: 'superadmin', passwordHash, phoneVerified: true, status: 'active', name } }, { upsert: true, runValidators: true });
  console.info(`Superadmin үүслээ: ${phone}`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
