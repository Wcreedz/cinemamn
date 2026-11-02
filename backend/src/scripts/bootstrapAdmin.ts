// Superadmin үүсгэнэ (дээд тал нь 3). Нууц үг кодод бичигдэхгүй: ADMIN_BOOTSTRAP_PASSWORD эсвэл stdin-ээс уншина.
// Хэрэглээ: npm run admin:bootstrap -- <имэйл> <утас> [нэр]
// Тухайн утастай хэрэглэгч байвал түүнд имэйл, нууц үг онооно.
import readline from 'readline';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { User } from '../models';
import { AuthService, hashPassword } from '../services/auth.service';
import { parse } from '../utils/http';
import { normalizePhone } from '../utils/phone';
import { emailField } from '../validators';

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
  const existing = await User.findOne({ phone }).select('_id').lean();
  await AuthService.assertSuperadminSlot(existing?._id);
  const emailOwner = await User.findOne({ email }).select('_id').lean();
  if (emailOwner && String(emailOwner._id) !== String(existing?._id)) throw new Error('Энэ имэйлийг өөр хэрэглэгч ашиглаж байна.');
  const password = await readPassword();
  if (!password) throw new Error('Нууц үгээ оруулна уу.');
  const passwordHash = await hashPassword(password);
  await User.findOneAndUpdate({ phone }, { $set: { role: 'superadmin', email, passwordHash, status: 'active', name } }, { upsert: true, runValidators: true });
  console.info(`Superadmin бэлэн: ${email}`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
