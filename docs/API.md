# API

Бүх алдаа: `{ "error": { "code", "message", "details?" } }`. Жагсаалт: `{ items, total, page, limit, pages }`.

**Нэвтрэлт**: `POST /api/auth/register { phone, password, name }`, `login` (хэрэглэгч, утсаар), `admin/login` (админ, имэйлээр), `change-password`, `reset-password { phone, password, confirmPassword }` (зөвхөн хэрэглэгч), `logout`, `refresh`; `GET|PATCH /api/auth/me`

**Кино**: `GET /api/movies?category&year&sort&page&limit`, `/movies/featured`, `/movies/new`, `/movies/popular`, `/movies/:slug`, `/categories`, `/search?q=`

**Эрх**: `GET /api/subscriptions/plans`, `/me`, `/history`

**Төлбөр**: `POST /api/qpayGargaya { planCode }`, `GET|POST /api/qpaycallback/:baiguullagiinId/:zakhialgiinDugaar`, `GET /api/payments/:id`, `POST /api/payments/:id/check`, `GET /api/payments/history`. Хөгжүүлэлтэд л: `POST /api/payments/:id/dev-simulate`

**Тоглуулалт**: `POST /api/stream/:movieId/token`, `GET /api/stream/:movieId/manifest`, `GET /api/watch-history`, `PUT /api/watch-history/:movieId`

**Нийтийн тохиргоо**: `GET /api/settings/public`

**Админ** (`/api/admin`, admin эрх): `dashboard`, `users`, `users/:id`, `users/:id/status`, `users/:id/password`, `movies` CRUD, `movies/:id/upload/start`, `movies/:id/upload/:uploadId/chunks/:index`, `movies/:id/upload/:uploadId/complete`, `movies/:id/image?kind=`, `video-jobs`, `categories` CRUD, `categories/:id/image`, `banners/image`, `payments`, `payments/:id/verify`, `payments/:id/refund` (superadmin), `subscriptions`, `subscriptions/:userId/extend`, `logs`, `admins` (superadmin)

**Тохиргоо**: `GET /api/admin/settings`, `PUT /api/admin/settings { section, value }`, `PUT /api/admin/settings/{general|subscription|video|security|homepage} { value, expectedVersion? }`, `GET /api/admin/settings/history`
