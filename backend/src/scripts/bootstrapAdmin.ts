// Анхны Superadmin үүсгэнэ. Нууц үг кодод бичигдэхгүй: ADMIN_BOOTSTRAP_PASSWORD эсвэл stdin-ээс уншина.
// Хэрэглээ: npm run admin:bootstrap -- <имэйл> <утас> [нэр]
// Имэйлгүй үлдсэн superadmin (өмнөх хувилбараас) байвал түүнд имэйл, нууц үг онооно.
import readline from 'readline';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { User } from '../models';
import { hashPassword } from '../services/auth.service';
import { parse } from '../utils/http';
import { normalizePhone } from '../utils/phone';
import { emailField } from '../validators';

const MIN_LENGTH = 4;
const RECOMMENDED_LENGTH = 12;

async function readPassword() {
  if (process.env.ADMIN_BOOTSTRAP_PASSWORD) return process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  const answer = await new Promise<string>((resolve) => {
    rl.question('Нууц үг: ', resolve);
    out._writeToOutput = () => undefined;
  });
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function main() {
  const [emailArg, phoneArg, name = 'Superadmin'] = process.argv.slice(2);
  if (!emailArg || !phoneArg) throw new Error('Хэрэглээ: npm run admin:bootstrap -- <имэйл> <утас> [нэр]');
  const email = parse(emailField, emailArg);
  const phone = normalizePhone(phoneArg);
  await connectDb();
  if (await User.exists({ role: 'superadmin', email: { $type: 'string' } })) throw new Error('Superadmin аль хэдийн байна. Нэмэлт админыг /admin/settings дээрээс үүсгэнэ үү.');
  const password = await readPassword();
  if (password.length < MIN_LENGTH) throw new Error(`Нууц үг дор хаяж ${MIN_LENGTH} тэмдэгт байх ёстой.`);
  const passwordHash = await hashPassword(password);
  await User.findOneAndUpdate({ phone }, { $set: { role: 'superadmin', email, passwordHash, status: 'active', name } }, { upsert: true, runValidators: true });
  console.info(`Superadmin бэлэн: ${email}`);
  if (password.length < RECOMMENDED_LENGTH) console.warn(`АНХААР: нууц үг ${RECOMMENDED_LENGTH} тэмдэгтээс богино байна. Нэвтэрсний дараа Профайл хэсгээс солино уу.`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
