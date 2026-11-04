# QPay

QPay-н бүх дуудлага [quickqpaypackv2](../backend/src/services/qpay.gateway.ts) сангаар явна. Санг өөрчилдөггүй. Вэбийн тохиргооны хэсэг байхгүй: нэхэмжлэх үүсгэх үед л дуудагдана.

## Тохируулах

1. Баазын `QpayKhariltsagch` цуглуулгад бүртгэлтэй merchant-ийн баримт байх ёстой. MongolFlix QPay-д шинээр бүртгэл үүсгэхгүй.
2. Баримтын `baiguullagiinId`, салбарын `salbariinId` нь [qpay.gateway.ts](../backend/src/services/qpay.gateway.ts)-ийн `BAIGUULLAGIIN_ID`, `BARILGIIN_ID` тогтмолуудтай таарах ёстой.
3. `.env`:

```ini
QPAY_MERCHANT_SERVER=https://quickqr.qpay.mn/
UNDSEN_SERVER=https://cinemamn-1g1l.vercel.app/api
```

Аль нэг нь дутуу бол `POST /qpayGargaya` 503 буцаана. `QpayKhariltsagch`, `token` өөр баазад байвал `QPAY_MONGODB_URI`-г заана.

## Merchant сонголт

Сан `qpayShimtgelTurul`-аар нэвтрэх эрх болон merchant-ийг сонгоно: `false` бол `merchant_idFalse`, `true` бол `merchant_idTrue`. Данс нь тухайн салбарын `bank_accounts`.

## Сангаас үүдэх хязгаарлалт

| Хязгаарлалт | Үр дагавар |
|---|---|
| Нэвтрэх мэдээлэл санд кодоор бичигдсэн | MongolFlix-д хадгалдаггүй, солихын тулд санг шинэчилнэ |
| Валют `MNT` бичигдсэн | MNT-ээс өөр үнийн нэхэмжлэх үүсгэхгүй |
| Сан ижил нэвтрэх мэдээллээр токен авдаг | Бусад систем ижил эрх ашиглавал session нь солигдож, 401-ийн дараа дахин токен авна |

## Шимтгэл

QPay 1% шимтгэл авдаг тул зөвхөн нэхэмжлэх дээр нэмж авна: сайтын үнэ 9,900₮ бол нэхэмжлэх 9,999₮. Шимтгэл зөвхөн QPay төлөх хуудсанд харагдана; багц, түүх, эрх, админы жагсаалт, орлого үндсэн үнээр (`amount - fee`) харагдана. Тооцоолол [subscriptionPricing.service.ts](../backend/src/services/subscriptionPricing.service.ts)-д нэг газар, бутархайг дээш тоймлоно. `payments.amount` нь шимтгэл орсон нийт дүн, `payments.fee` нь шимтгэл. Нэмэгдэхээс өмнө үүссэн нэхэмжлэх хуучин дүнгээрээ хүчинтэй.

## Шалгалтын логик

Нэхэмжлэх бүр `qpayBaiguullagiinId`, `qpayBarilgiinId`-аа хадгалдаг тул кодын ID солигдсон ч хуучин нэхэмжлэх үүссэн merchant-аараа шалгагдана.

`payment/check`-ийн хариуг `parseCheckResponse` уншина: `invoice_status: PAID`, `payments[].payment_status: SUCCESS`, `payments[].amount: "100.00"`, `payments[].currency` (quickqr.qpay.mn-ийн бодит хариугаар баталгаажсан). Хариунд төлсөн дүн олдохгүй бол (`unverifiable`) эрхийг автоматаар идэвхжүүлэхгүй, админ "Төлбөрүүд" хэсгээс шалгана.

QPay-н баримт `payment/check`-ийг cron-оор дуудахыг хориглодог тул callback, хэрэглэгчийн товч (10 секундийн cooldown), админы товчоор л дуудна.

## Callback

`<UNDSEN_SERVER>/qpaycallback/<байгууллага>/<захиалга>` хаягийг `qpayGargaya` дуудахын өмнө бүтээнэ. Хүсэлтийн агуулгад итгэхгүй, зөвхөн QPay-с шууд шалгасан үр дүнг ашиглана. Callback PAID төлөвөөс түрүүлж ирэх тохиолдолд богино завсартай дахин шалгана (`QPAY_CHECK_RETRIES`).
