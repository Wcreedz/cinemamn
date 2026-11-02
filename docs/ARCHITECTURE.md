# Архитектур

```
Хөтөч ──▶ Nginx ──┬─▶ web (Next.js)  : хуудсууд, /api-г API руу дамжуулна
                  ├─▶ api (Express)  : REST, /api/*
                  └─▶ /v/<токен>/<кино>/<файл> ── auth_request ──▶ api /internal/stream/verify
                         └─ зөвшөөрвөл /srv/mongolflix/hls-с шууд өгнө
worker (Node) ── FFmpeg ──▶ /srv/mongolflix/hls        MongoDB
```

- **frontend/**: Next.js (App Router), Tailwind, shadcn/ui загварын компонентууд. Хэрэглэгчийн хэсэг бараан, `/admin` цайвар theme-тэй.
- **backend/**: Express 5, Zod, Mongoose. `routes` → `controllers` → `services` → `models`.
- **worker**: `backend/src/jobs/worker.ts`. FFmpeg ажлын дараалал (MongoDB `video_jobs`), хугацаа дууссан эрх/нэхэмжлэхийн цэвэрлэгээ, дутуу үлдсэн төлбөрийн эрхийг нөхөх. HTTP процессоос тусдаа.
- **shared/**: API-н төрлүүд (зөвхөн `import type`).

## Төвлөрсөн тохиргоо

Бизнесийн тохиргоо кодод биш, өгөгдлийн санд:

| Сервис | Эх сурвалж | Агуулга |
|---|---|---|
| `SettingsService` | `system_settings` | general, subscription, video, security, homepage |
| `SubscriptionPricingService` | subscription setting | Багц, үнэ. Нэхэмжлэхэд үргэлж кэшгүй уншина |
| `QPayConfigurationService` | `qpay_configurations` | Хувилбартай QPay лавлагаа |
| `SmsConfigurationService` | `sms_configurations` | Хувилбартай, шифрлэгдсэн SMS тохиргоо, OTP дүрэм |
| `VideoConfigurationService` | video setting | Хадгалах зам, чанар, FFmpeg |

Кэш нь процесс доторх 30 секундын TTL-тэй, хадгалмагц тухайн процесст цэвэрлэгдэнэ. Worker эсвэл өөр API процесс хамгийн ихдээ 30 секунд хоцорно. Анхны утгууд зөвхөн `settings.service.ts`-д байна.

Цөөн утга санаатайгаар орчны хувьсагчид үлдсэн: нууц түлхүүрүүд, `FFMPEG_PATH`, `VIDEO_ALLOWED_ROOTS`. Эдгээрийг вэбээс өөрчлүүлбэл админы эрх серверийн кодын гүйцэтгэл болж хувирах эрсдэлтэй.

## Төлбөрийн урсгал

1. `POST /payments/qpay/create`: зөвхөн `planCode` уншина. Үнэ, хугацааг баазаас шууд авч, тохиргооны хувилбарын хамт өөрчлөгдөшгүй хадгална.
2. `qpayGargaya` QR буцаана.
3. QPay callback → `verifyFromCallback` → `qpayShalgay` тухайн нэхэмжлэхийн хувилбарын лавлагаагаар шалгана.
4. Нэхэмжлэхийн дугаар, PAID төлөв, дүн, валютыг тулгана.
5. `applyPaid`: `pending→paid` нөхцөлт шинэчлэлт, дараа нь `paymentId` unique эрх үүсгэлт. Давхар callback эхний алхамд зогсоно. Дундаа тасарвал worker нөхнө ([DATABASE.md](DATABASE.md)).
