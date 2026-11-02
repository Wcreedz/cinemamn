# MongolFlix

Сарын эрхтэй, Монгол хэл дээрх кино үзэх платформ. Next.js, Express, MongoDB, QPay ([quickqpaypackv2](docs/QPAY_SETUP.md)), FFmpeg/HLS.

## Суулгах

Шаардлага: Node 20.9+, MongoDB 7, FFmpeg, PM2 (production), хувийн npm registry (`103.236.194.68:4873`) руу хандах эрх.

```sh
npm install
cp .env.example .env     # нууц түлхүүрүүдээ бөглөнө
npm run seed:categories
npm run admin:bootstrap -- +97699112233 "Нэр"
npm run dev              # API :4100, вэб :3100, видео worker
```

Сайт: http://localhost:3100, админ: http://localhost:3100/admin

## Шалгах

```sh
npm run lint && npm run typecheck && npm run test && npm run build
```

Тестүүд MongoDB-г (`mongodb-memory-server`) болон FFmpeg-ийг (`ffmpeg-static`) автоматаар татдаг.

## Бүтэц

`frontend/`, `backend/`, `shared/`, `video-server/`, `infrastructure/`, `docs/`. Эхлэх: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), явц: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

Анхны `index.html` бол өмнөх статик загвар бөгөөд энэ аппын нэг хэсэг биш.
