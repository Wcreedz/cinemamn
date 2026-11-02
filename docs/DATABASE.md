# Өгөгдлийн сан

Standalone MongoDB ашиглана: transaction, replica set шаардлагагүй.

Mongoose 6 хувилбарыг санаатай сонгосон: `quickqpaypackv2` түүний схемүүдийг шууд ашигладаг тул ижил хувилбар хэрэгтэй. Энэ хувилбар MongoDB 7-той ажиллана.

## Цуглуулгууд

`users`, `refresh_sessions` (TTL), `categories`, `movies` (text index), `subscriptions`, `payments`, `watch_history`, `playback_sessions` (TTL), `admin_logs`, `system_settings`, `video_jobs`. Багцын цуглуулгууд: `QpayKhariltsagch`, `QuickQpayObject`, `token`.

Схем, индексүүд: [backend/src/models/index.ts](../backend/src/models/index.ts).

## Гол хязгаарлалтууд

- `payments.orderNumber` unique, `payments.invoiceId` partial unique
- `subscriptions.paymentId` partial unique: нэг төлбөрөөс нэг эрх
- `subscriptions (userId, seq)` unique: зэрэгцээ төлбөрүүд хугацаагаа давхцуулахгүй
- `payments.amount/currency/durationDays/qpayBaiguullagiinId...` immutable

## Transaction-гүй төлбөрийн баталгаа

1. `pending → paid` нөхцөлт шинэчлэлт: зэрэгцээ дуудлагаас нэг л нь нэвтэрнэ.
2. Эрх үүсгэнэ: `paymentId` unique тул давтахад аюулгүй.
3. `payments.subscriptionId` бичнэ.

2 эсвэл 3-р алхмын өмнө сервер унавал төлбөр "paid, subscriptionId-гүй" үлдэнэ. Дараагийн callback/шалгалт эсвэл worker (минут тутам `repairIncomplete`) эрхийг нөхөж дуусгана. Тиймээс **worker заавал ажиллаж байх ёстой**: унасан тохиолдолд эрх хүртэл хугацаа уртасна.

Зөрүү: ийм тасралтын үед хэрэглэгч эрхээ хамгийн ихдээ нэг минут орчим хойшлуулж авна (өмнө нь transaction үүнийг нэг агшинд хийдэг байсан).

## Нөөцлөлт

`infrastructure/backup/backup.sh` (cron), `restore.sh`.
