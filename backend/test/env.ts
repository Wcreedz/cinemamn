// Тестийн түлхүүрүүд: зөвхөн тест ажиллах үед хэрэглэгдэх санамсаргүй утгууд.
import crypto from 'crypto';
import os from 'os';
import path from 'path';

const rnd = () => crypto.randomBytes(32).toString('hex');
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://placeholder',
  JWT_ACCESS_SECRET: rnd(),
  PLAYBACK_TOKEN_SECRET: rnd(),
  OTP_PEPPER: rnd(),
  INTERNAL_AUTH_SECRET: 'internal-secret-for-tests-only-0123456789',
  SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  CORS_ORIGINS: 'http://localhost:3100',
  QPAY_MERCHANT_SERVER: 'http://127.0.0.1:18931/',
  QPAY_SERVER_ENV: 'sandbox',
  QPAY_CHECK_RETRIES: '2',
  QPAY_CHECK_RETRY_DELAY_MS: '5',
  RATE_LIMIT_MAX: '100000',
  AUTH_RATE_LIMIT_MAX: '100000',
  SERVE_HLS_FROM_API: 'true',
  PUBLIC_VIDEO_BASE_URL: 'http://localhost:4100',
  VIDEO_DEFAULT_ROOT: path.join(os.tmpdir(), `mongolflix-test-${process.pid}`),
});

// npm install-ийн postinstall татсан mongod-ийг дахин ашиглана.
process.env.MONGOMS_DOWNLOAD_DIR ??= path.resolve(__dirname, '../../node_modules/.cache/mongodb-memory-server');

// Видео worker-ийн тестүүд системд FFmpeg суулгаагүй ч жинхэнэ binary-р ажиллана.
// eslint-disable-next-line @typescript-eslint/no-require-imports
process.env.FFMPEG_PATH = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-require-imports
process.env.FFPROBE_PATH = require('ffprobe-static').path;
