# API

Бүх алдаа: `{ "error": { "code", "message", "details?" } }`. Жагсаалт: `{ items, total, page, limit, pages }`.

**Нэвтрэлт**: `POST /api/auth/send-otp`, `verify-otp`, `register`, `login`, `logout`, `refresh`, `reset-password`; `GET|PATCH /api/auth/me`

**Кино**: `GET /api/movies?category&year&sort&page&limit`, `/movies/featured`, `/movies/new`, `/movies/popular`, `/movies/:slug`, `/categories`, `/search?q=`

**Эрх**: `GET /api/subscriptions/plans`, `/me`, `/history`

**Төлбөр**: `POST /api/payments/qpay/create { planCode }`, `GET|POST /api/payments/qpay/callback?order=`, `GET /api/payments/:id`, `POST /api/payments/:id/check`, `GET /api/payments/history`. Хөгжүүлэлтэд л: `POST /api/payments/:id/dev-simulate`

**Тоглуулалт**: `POST /api/stream/:movieId/token`, `GET /api/stream/:movieId/manifest`, `GET /api/watch-history`, `PUT /api/watch-history/:movieId`

**Нийтийн тохиргоо**: `GET /api/settings/public`

**Админ** (`/api/admin`, admin эрх): `dashboard`, `users`, `users/:id`, `users/:id/status`, `movies` CRUD, `movies/:id/upload`, `movies/:id/image?kind=`, `video-jobs`, `categories` CRUD, `payments`, `payments/:id/verify`, `payments/:id/refund` (superadmin), `subscriptions`, `subscriptions/:userId/extend`, `logs`, `admins` (superadmin)

**Тохиргоо**: `GET /api/admin/settings`, `PUT /api/admin/settings { section, value }`, `PUT /api/admin/settings/{general|subscription|video|security|homepage} { value, expectedVersion? }`, `GET /api/admin/settings/history`, `GET|POST /api/admin/settings/qpay`, `POST .../qpay/test`, `POST .../qpay/verify`, `GET|POST .../qpay/merchant`, `DELETE .../qpay/versions/:id`, `GET|POST /api/admin/settings/sms`, `POST .../sms/test`
