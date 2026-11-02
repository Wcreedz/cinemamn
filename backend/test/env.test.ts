import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';

const secrets = {
  JWT_ACCESS_SECRET: 'a'.repeat(32), PLAYBACK_TOKEN_SECRET: 'b'.repeat(32), OTP_PEPPER: 'c'.repeat(32), INTERNAL_AUTH_SECRET: 'd'.repeat(32),
  SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('Орчны хувьсагч', () => {
  it('.env.example-ийн хоосон сонголттой мөрүүд алдаа өгөхгүй, анхны утга хэрэглэгдэнэ', () => {
    const e = parseEnv({ ...secrets, COOKIE_SECURE: '', QPAY_SERVER_ENV: '', QPAY_MONGODB_URI: '', COOKIE_DOMAIN: '', VIDEO_ALLOWED_ROOTS: '', VIDEO_DEFAULT_ROOT: '', MONGODB_URI: '' });
    expect(e.COOKIE_SECURE).toBeUndefined();
    expect(e.QPAY_SERVER_ENV).toBeUndefined();
    expect(e.VIDEO_DEFAULT_ROOT.length).toBeGreaterThan(0);
    expect(e.MONGODB_URI).toBe('mongodb://localhost:27017/mongolflix');
  });

  it('хоосон нууц түлхүүрийг зөвшөөрөхгүй, аль нь дутууг нэрлэнэ', () => {
    expect(() => parseEnv({ ...secrets, JWT_ACCESS_SECRET: '' })).toThrow(/JWT_ACCESS_SECRET: заавал бөглөнө/);
    expect(() => parseEnv({ ...secrets, SETTINGS_ENCRYPTION_KEY: '' })).toThrow(/SETTINGS_ENCRYPTION_KEY: заавал бөглөнө/);
  });

  it('буруу утгыг татгалзана', () => {
    expect(() => parseEnv({ ...secrets, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
    expect(() => parseEnv({ ...secrets, OTP_PEPPER: 'short' })).toThrow(/OTP_PEPPER/);
  });
});
