# Байршуулалт (Ubuntu VPS, PM2)

Эдгээр алхмыг автоматаар ажиллуулаагүй: production-д өөрчлөлт хийхэд таны зөвшөөрөл шаардлагатай.

## 1. Сервер бэлтгэх

Node 20.9+, Nginx, FFmpeg, MongoDB 7, PM2:

```sh
sudo apt install nginx ffmpeg ufw
# Node 22: https://nodejs.org, MongoDB 7: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/
sudo npm install -g pm2
sudo infrastructure/scripts/firewall.sh
```

MongoDB-г зөвхөн localhost дээр (`/etc/mongod.conf`):

```yaml
net: { bindIp: 127.0.0.1, port: 27017 }
```

```sh
sudo systemctl enable --now mongod
```

Видео хадгалах хавтас:

```sh
sudo mkdir -p /srv/mongolflix/{originals,hls,posters,backdrops,temp}
sudo chown -R "$USER":www-data /srv/mongolflix
sudo chmod -R 750 /srv/mongolflix
```

Портууд: вэб **3110**, API **4100** (зөвхөн 127.0.0.1). Гаднаас зөвхөн Nginx 80/443. Сервер дээр өөр сайт байгаа бол Nginx нь `server_name`-ээр салгана. Эхлэхээс өмнө шалгах:

```sh
sudo ss -lntp | grep -E ':(3110|4100|27017)'
```

Апп нь серверийн үндсэн MongoDB (`localhost:27017`) дээрх тусдаа `mongolflix` бааз руу холбогдоно. Бусад баазад хүрэхгүй. MongoDB нэвтрэлттэй (`authorization: enabled`) бол тухайн баазад л эрхтэй хэрэглэгч үүсгэж `MONGODB_URI`-д оруулна: `mongodb://<хэрэглэгч>:<нууц үг>@localhost:27017/mongolflix?authSource=mongolflix`.

## 2. Апп

```sh
git clone <repo> /opt/mongolflix && cd /opt/mongolflix
cp .env.example .env && nano .env
```

Production-д бүх нууц түлхүүрээс гадна:

```ini
NODE_ENV=production
PORT=4100
MONGODB_URI=mongodb://localhost:27017/mongolflix
CORS_ORIGINS=https://zzzcinema.mn
PUBLIC_VIDEO_BASE_URL=https://zzzcinema.mn
API_INTERNAL_URL=http://127.0.0.1:4100
TRUST_PROXY=1
SERVE_HLS_FROM_API=false
VIDEO_DEFAULT_ROOT=/srv/mongolflix
VIDEO_ALLOWED_ROOTS=/srv/mongolflix
QPAY_MERCHANT_SERVER=https://quickqr.qpay.mn/
UNDSEN_SERVER=https://zzzcinema.mn/api
```


```sh
chmod 600 .env
infrastructure/scripts/deploy.sh
npm run seed:categories
npm run admin:bootstrap -- admin@zzzcinema.mn +976XXXXXXXX "Нэр"
pm2 startup     # гарсан тушаалыг ажиллуулна: сервер асахад PM2 өөрөө асна
```

`quickqpaypackv2`, `zevbackv2` нь хувийн registry-ээс (`103.236.194.68:4873`) татагдах тул сервер түүн рүү хандах боломжтой байх ёстой.

## 3. Nginx

```sh
sudo cp infrastructure/nginx/mongolflix.conf /etc/nginx/sites-available/mongolflix
printf 'proxy_set_header X-Internal-Secret "%s";\n' "$(grep ^INTERNAL_AUTH_SECRET= .env | cut -d= -f2-)" | sudo tee /etc/nginx/snippets/mongolflix-internal.conf >/dev/null
sudo chmod 640 /etc/nginx/snippets/mongolflix-internal.conf && sudo chown root:www-data /etc/nginx/snippets/mongolflix-internal.conf
sudo mkdir -p /var/cache/nginx
sudo ln -s /etc/nginx/sites-available/mongolflix /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 4. HTTPS

DNS бичлэг идэвхжсэний дараа:

```sh
sudo certbot --nginx -d zzzcinema.mn -d www.zzzcinema.mn
```

Certbot зөвхөн энэ сайтын блокийг өөрчилнө. Сервер дээрх бусад сайт хэвээр үлдэнэ.

## 5. Нөөцлөлт, лог, хяналт

```cron
0 3 * * * /opt/mongolflix/infrastructure/backup/backup.sh
```

```sh
pm2 install pm2-logrotate     # логийн эргэлт
pm2 status && pm2 logs        # хяналт
curl http://127.0.0.1:4100/api/health
```

Сэргээх: `infrastructure/backup/restore.sh <файл>`. Видео файлуудыг (`/srv/mongolflix`) тусад нь rsync хийнэ.

Шинэчлэх: `git pull && infrastructure/scripts/deploy.sh`

## Домэйн: zzzcinema.mn

Вэб, API, видео бүгд нэг домэйн дээр ажиллана. Тиймээс cookie, CORS энгийн, QPay callback нэг хаягтай.

| Бичлэг | Утга |
|---|---|
| `A zzzcinema.mn` | VPS-ийн IP |
| `A www.zzzcinema.mn` | VPS-ийн IP |

2026-11-02-нд шалгахад эдгээр DNS бичлэг олдоогүй тул эхлээд нэмнэ. Сайтын харагдах нэр кодод биш, `/admin/settings` → **Ерөнхий** дээр тохируулагдана.

Cloudflare Proxied ашиглавал үнэгүй багц нэг хүсэлтэд 100 MB хязгаартай тул том видео байршуулах боломжгүй. Эхлээд DNS-only горимоор, certbot ашиглан ажиллуулахыг зөвлөж байна.
