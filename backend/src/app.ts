import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import * as stream from './controllers/stream.controller';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, maintenanceGate, originCheck, sanitizeBody } from './middleware/security';
import { api } from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(cookieParser());

  // Nginx auth_request-ээс л дуудагдана: нууц толгойгоор хамгаалагдсан.
  app.get('/internal/stream/verify', stream.internalVerify);
  if (env.serveHlsFromApi) {
    app.get('/v/:token/:movieId/*file', stream.deliver);
    app.use('/media/posters', express.static(path.join(env.VIDEO_DEFAULT_ROOT, 'posters'), { dotfiles: 'deny', index: false }));
    app.use('/media/backdrops', express.static(path.join(env.VIDEO_DEFAULT_ROOT, 'backdrops'), { dotfiles: 'deny', index: false }));
  }

  app.use('/api', apiLimiter, express.json({ limit: '1mb' }), express.urlencoded({ extended: false, limit: '100kb' }), sanitizeBody, originCheck, maintenanceGate, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
