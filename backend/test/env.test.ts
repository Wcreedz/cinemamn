import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';

const secrets = { JWT_ACCESS_SECRET: 'a'.repeat(32), PLAYBACK_TOKEN_SECRET: 'b'.repeat(32), INTERNAL_AUTH_SECRET: 'd'.repeat(32) };

describe('Орчны хувьсагч', () => {
  it('.env.example-ийн хоосон сонголттой мөрүүд алдаа өгөхгүй, анхны утга хэрэглэгдэнэ', () => {
    const e = parseEnv({ ...secrets, COOKIE_SECURE: '', UNDSEN_SERVER: '', QPAY_MONGODB_URI: '', COOKIE_DOMAIN: '', VIDEO_ALLOWED_ROOTS: '', VIDEO_DEFAULT_ROOT: '', MONGODB_URI: '' });
    expect(e.COOKIE_SECURE).toBeUndefined();
    expect(e.UNDSEN_SERVER).toBeUndefined();
    expect(e.VIDEO_DEFAULT_ROOT.length).toBeGreaterThan(0);
    expect(e.MONGODB_URI).toBe('mongodb://localhost:27017/mongolflix');
  });

  it('хоосон нууц түлхүүрийг зөвшөөрөхгүй, аль нь дутууг нэрлэнэ', () => {
    expect(() => parseEnv({ ...secrets, JWT_ACCESS_SECRET: '' })).toThrow(/JWT_ACCESS_SECRET: заавал бөглөнө/);
  });

  it('хуучин .env-д үлдсэн SMS түлхүүрүүд саад болохгүй', () => {
    expect(() => parseEnv({ ...secrets, OTP_PEPPER: 'x', SETTINGS_ENCRYPTION_KEY: 'x' })).not.toThrow();
  });

  it('production дээр видео хавтас заавал заагдана, хөгжүүлэлтэд анхны утгатай', () => {
    expect(() => parseEnv({ ...secrets, NODE_ENV: 'production' })).toThrow(/VIDEO_DEFAULT_ROOT/);
    expect(() => parseEnv({ ...secrets, NODE_ENV: 'production', VIDEO_DEFAULT_ROOT: '' })).toThrow(/VIDEO_DEFAULT_ROOT/);
    expect(parseEnv({ ...secrets, NODE_ENV: 'production', VIDEO_DEFAULT_ROOT: '/srv/mongolflix' }).VIDEO_DEFAULT_ROOT).toBe('/srv/mongolflix');
    expect(parseEnv({ ...secrets, NODE_ENV: 'development' }).VIDEO_DEFAULT_ROOT.length).toBeGreaterThan(0);
  });

  it('буруу утгыг татгалзана', () => {
    expect(() => parseEnv({ ...secrets, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
    expect(() => parseEnv({ ...secrets, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
