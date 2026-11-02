# Аюулгүй байдал

- **Нууц үг**: argon2id. **OTP**: зөвхөн HMAC hash, 5 оролдлого, TTL. **Refresh token**: зөвхөн SHA-256 hash, rotation, давтан ашиглалт илэрвэл гэр бүлээр нь цуцална.
- **Cookie**: HttpOnly, SameSite=Lax, production дээр Secure. **CSRF**: SameSite + Origin allowlist.
- **Эрх**: `requireAdmin` бүх `/api/admin`-д, хэрэглэгчийг хүсэлт бүрт баазаас уншина. Заавал биш IP allowlist.
- **Оролт**: Zod бүх endpoint-д, `$`/`.` түлхүүр хасна, regex-ийг escape хийнэ. **Файл**: зурагт magic byte, видеонд MIME/өргөтгөл + ffprobe.
- **Толгой**: Helmet, CORS allowlist, rate limit (IP), бүртгэлийн түгжээ.
- **Төлбөр**: фронтоос дүн авахгүй, callback-д дангаар итгэхгүй, нөхцөлт шинэчлэлт + unique индекс. Симулятор production-д холбогдохгүй.
- **Лог**: админы бүх үйлдэл `admin_logs`-д, нууц утгууд зөвхөн далдлагдсанаар.
- **Анхны админ**: кодод нууц үг байхгүй, `npm run admin:bootstrap`.

## Анхаарах эрсдэл

- `quickqpaypackv2`-ийн эх кодод QPay-н нэвтрэх мэдээлэл бичигдсэн. Үүнд хандах эрхтэй хүн бүр (git, хувийн registry) уг мэдээллийг харж чадна.
- Хувийн registry шифрлэгдээгүй HTTP-ээр холбогддог. `package-lock.json`-ийн integrity hash нь татсан файлын бүрэн бүтэн байдлыг шалгана.
- Mongoose 6 багцын нийцлийн улмаас сонгогдсон: дэмжлэгийн хугацааг хянах хэрэгтэй.
