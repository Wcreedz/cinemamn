import { connectDb } from '../config/db';
import { PaymentService } from '../services/payment.service';
import { SubscriptionService } from '../services/subscription.service';
import { VideoService } from '../services/video.service';

const POLL_MS = 5_000;
// Төлсөн хэрэглэгч эрхээ хүлээх дээд хугацааг тодорхойлдог тул богино байна.
const HOUSEKEEPING_MS = 60_000;

async function housekeeping() {
  const [subs, pays] = await Promise.all([SubscriptionService.expireDue(), PaymentService.expirePending()]);
  await VideoService.requeueStale();
  const repaired = await PaymentService.repairIncomplete();
  if (repaired.activated || repaired.cancelled) console.warn(`[worker] нөхөв: ${repaired.activated} төлбөрийн эрх, ${repaired.cancelled} цуцлалт`);
  if (subs || pays) console.info(`[worker] ${subs} эрх, ${pays} нэхэмжлэх дууссанд тооцов`);
}

async function loop() {
  for (;;) {
    const job = await VideoService.claimNext();
    if (job) await VideoService.process(job);
    else await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  await connectDb();
  console.info('[worker] ажиллаж эхэллээ');
  await VideoService.checkTools().catch((err) => console.error(`[worker] ${err.message}`));
  await housekeeping();
  setInterval(() => housekeeping().catch((e) => console.error('[worker]', e)), HOUSEKEEPING_MS);
  await loop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
