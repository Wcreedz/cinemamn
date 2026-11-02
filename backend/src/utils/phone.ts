import { badRequest } from './errors';

// Монгол гар утасны дугаарыг E.164 (+976XXXXXXXX) хэлбэрт оруулна.
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^00/, '');
  const local = digits.length === 11 && digits.startsWith('976') ? digits.slice(3) : digits;
  if (!/^[6-9]\d{7}$/.test(local)) throw badRequest('Утасны дугаар буруу байна. 8 оронтой Монгол дугаар оруулна уу.');
  return `+976${local}`;
}
