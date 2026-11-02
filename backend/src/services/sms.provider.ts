import { AppError } from '../utils/errors';

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

// Хөгжүүлэлтийн горимд л ашиглагдана. Тестийн `outbox`-оор илгээсэн мессежийг шалгана.
export const devOutbox: { to: string; text: string }[] = [];
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  async send(to: string, text: string) {
    devOutbox.push({ to, text });
    if (process.env.NODE_ENV === 'development') console.info(`[sms:mock] ${to}: ${text}`);
  }
}

export interface HttpSmsOptions { apiUrl: string; apiKey?: string; apiSecret?: string; senderId?: string }

// Ерөнхий HTTP adapter: { to, from, text } JSON-г X-Api-Key/X-Api-Secret толгойтой илгээнэ.
export class HttpSmsProvider implements SmsProvider {
  readonly name = 'http';
  constructor(private readonly o: HttpSmsOptions) {}
  async send(to: string, text: string) {
    let res: Response;
    try {
      res = await fetch(this.o.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.o.apiKey ? { 'X-Api-Key': this.o.apiKey } : {}),
          ...(this.o.apiSecret ? { 'X-Api-Secret': this.o.apiSecret } : {}),
        },
        body: JSON.stringify({ to, from: this.o.senderId, text }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new AppError(502, 'SMS_SEND_FAILED', `SMS үйлчилгээ рүү холбогдож чадсангүй: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      throw new AppError(502, 'SMS_SEND_FAILED', `SMS үйлчилгээ алдаа буцаалаа (${res.status}): ${body}`);
    }
  }
}
