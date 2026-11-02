import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { User, Category, Movie } from '../src/models';
import { hashPassword } from '../src/services/auth.service';
import { BAIGUULLAGIIN_ID, BARILGIIN_ID } from '../src/services/qpay.gateway';
import { SettingsService } from '../src/services/settings.service';

let mongo: MongoMemoryServer;
export const app = createApp();
export const api = () => request(app);

export async function startDb() {
  // Production-той адил standalone: transaction ашиглавал тест унана.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('mongolflix_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
}
export async function stopDb() {
  await mongoose.disconnect();
  await mongo.stop();
}
export async function resetDb() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
  await mongoose.connection.db.collection('token').deleteMany({});
  SettingsService.invalidate();
}

let counter = 0;
export const nextPhone = () => `+9769${String(1000000 + ++counter).slice(-7)}`;

export async function login(role: 'user' | 'admin' | 'superadmin' = 'user') {
  const phone = nextPhone();
  const password = 'Test-password-123';
  const email = role === 'user' ? undefined : `a${phone.slice(1)}@example.com`;
  const user = await User.create({ phone, email, passwordHash: await hashPassword(password), role, name: role });
  const agent = request.agent(app);
  const res = role === 'user'
    ? await agent.post('/api/auth/login').send({ phone, password })
    : await agent.post('/api/auth/admin/login').send({ email, password, remember: true });
  if (res.status !== 200) throw new Error(`login failed ${res.status}`);
  return { user, agent, phone, email, password };
}

export async function makeMovie(over: Record<string, unknown> = {}) {
  const genre = await Category.create({ name: 'Драм', slug: `drama-${++counter}` });
  return Movie.create({ title: 'Туршилтын кино', slug: `test-${++counter}`, isPublished: true, videoStatus: 'ready', genres: [genre._id], ...over });
}

// QPay-н хариуг дууриах тест сервер. quickqpaypackv2 жинхэнэ кодоороо энэ серверийг дуудна.
export interface FakeInvoice { id: string; amount: number; status: string; paidAmount?: number; currency?: string; callback: string; merchantId: string; auth: string | undefined }
export class FakeQPay {
  invoices = new Map<string, FakeInvoice>();
  authCalls = 0;
  checkCalls = 0;
  merchantRequests = 0;
  rejectAuth = false;
  checkOverride: ((inv: FakeInvoice | undefined) => Record<string, unknown>) | null = null;
  private server: http.Server;

  constructor() {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => this.handle(req, res, raw ? JSON.parse(raw) : {}));
    });
  }
  start() { return new Promise<void>((r) => this.server.listen(18931, '127.0.0.1', r)); }
  stop() { return new Promise((r) => this.server.close(r)); }
  reset() { this.invoices.clear(); this.authCalls = 0; this.checkCalls = 0; this.merchantRequests = 0; this.rejectAuth = false; this.checkOverride = null; }
  markPaid(id: string, paidAmount?: number, currency = 'MNT') {
    const inv = this.invoices.get(id)!;
    inv.status = 'PAID'; inv.paidAmount = paidAmount ?? inv.amount; inv.currency = currency;
  }

  private send(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse, body: any) {
    const url = req.url ?? '';
    if (url.startsWith('/v2/auth/token')) {
      this.authCalls++;
      if (this.rejectAuth) return this.send(res, 401, { error: 'NO_CREDENTIALS', message: 'NO_CREDENTIALS' });
      return this.send(res, 200, { access_token: `token-${this.authCalls}`, refresh_token: 'r', expires_in: Math.floor(Date.now() / 1000) + 3600 });
    }
    if (url.startsWith('/v2/merchant')) {
      this.merchantRequests++;
      return this.send(res, 200, { id: 'unexpected' });
    }
    if (url.startsWith('/v2/invoice')) {
      const id = `inv-${this.invoices.size + 1}-${Date.now()}`;
      this.invoices.set(id, { id, amount: body.amount, status: 'OPEN', callback: body.callback_url, merchantId: body.merchant_id, auth: req.headers.authorization });
      return this.send(res, 200, { id, invoice_status: 'OPEN', amount: body.amount, qr_image: 'QRIMG', qr_code: 'QRTXT', urls: [{ name: 'Khan', link: 'khanbank://q' }] });
    }
    if (url.startsWith('/v2/payment/check')) {
      this.checkCalls++;
      const inv = this.invoices.get(body.invoice_id);
      if (this.checkOverride) return this.send(res, 200, this.checkOverride(inv));
      if (!inv) return this.send(res, 404, { error: 'INVOICE_NOTFOUND', message: 'INVOICE_NOTFOUND' });
      return this.send(res, 200, {
        id: inv.id, invoice_status: inv.status, currency: inv.currency,
        payments: inv.status === 'PAID' ? [{ id: 'pay-1', payment_status: 'PAID', amount: inv.paidAmount, currency: inv.currency }] : [],
      });
    }
    this.send(res, 404, { message: 'unknown' });
  }
}

export async function seedMerchant() {
  // Туршилтын зохиомол харилцагч: багцын бодит QpayKhariltsagch бүтэцтэй ижил.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QpayKhariltsagch = require('quickqpaypackv2').QpayKhariltsagch({ kholbolt: mongoose.connection });
  await QpayKhariltsagch.deleteMany({});
  await QpayKhariltsagch.create({
    type: 'COMPANY', baiguullagiinId: BAIGUULLAGIIN_ID, register_number: '1111111', name: 'Тест ХХК', mcc_code: '5641',
    merchant_idFalse: 'merchant-false', merchant_idTrue: 'merchant-true', city: '11000', district: '17000', address: 'х', phone: '99000000', email: 't@example.com',
    salbaruud: [{
      salbariinId: BARILGIIN_ID, salbariinNer: 'Төв', qpayShimtgelTurul: false,
      bank_accounts: [{ account_bank_code: '050000', account_number: '1000000001', account_name: 'Тест', qpayShimtgelTurul: false }],
    }, {
      salbariinId: 'previous-branch', salbariinNer: 'Хуучин', qpayShimtgelTurul: false,
      bank_accounts: [{ account_bank_code: '050000', account_number: '1000000002', account_name: 'Тест', qpayShimtgelTurul: false }],
    }],
  });
}

