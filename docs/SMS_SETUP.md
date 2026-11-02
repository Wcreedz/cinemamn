# SMS тохиргоо

`/admin/settings` → **SMS тохиргоо**. API Key/Secret нь AES-256-GCM-ээр шифрлэгдэж (`SETTINGS_ENCRYPTION_KEY`), API-р зөвхөн далдлагдсан хэлбэрээр буцна.

- `http` adapter: `POST <API URL>`, толгой `X-Api-Key`, `X-Api-Secret`, бие `{ to, from, text }`. 2xx-с бусад хариу алдаа болно.
- Өөр форматтай компани бол `SmsProvider` интерфейсийг [sms.provider.ts](../backend/src/services/sms.provider.ts)-д хэрэгжүүлж нэмнэ.
- `mock`: зөвхөн хөгжүүлэлтэд. Код серверийн консолд гарна. Production дээр сонгох боломжгүй.

Тохиргоо идэвхгүй үед `send-otp` 503 буцаана: SMS илгээсэн мэт дүр эсгэхгүй.
