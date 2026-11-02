import { connectDb } from './config/db';
import { env } from './config/env';
import { createApp } from './app';

async function main() {
  await connectDb();
  createApp().listen(env.PORT, () => console.info(`MongolFlix API: ${env.PORT} порт дээр ажиллаж байна`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
