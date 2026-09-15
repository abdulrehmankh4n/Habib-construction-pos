import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import bcrypt from 'bcryptjs';
import type { AppContext } from './context';
import { one, run } from './db';
import { authenticate } from './middleware/auth';
import { errorHandler, requireClientHeader } from './middleware/error';
import { nowLocal } from './lib/time';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { catalogRoutes } from './routes/catalog';
import { productRoutes } from './routes/products';
import { customerRoutes, supplierRoutes } from './routes/parties';
import { saleRoutes } from './routes/sales';
import { heldBillRoutes, quotationRoutes } from './routes/quotations';
import { purchaseRoutes } from './routes/purchases';
import { inventoryRoutes } from './routes/inventory';
import { cashbookRoutes, expenseRoutes, paymentRoutes } from './routes/finance';
import { reportRoutes } from './routes/reports';
import { adminRoutes } from './routes/admin';
import { agreementRoutes, notificationRoutes } from './routes/engagement';
import { zakatRoutes } from './routes/zakat';

export function ensureAdminUser(ctx: AppContext) {
  const existing = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM users')!.n;
  if (existing > 0) return false;
  const now = nowLocal();
  run(
    ctx.db,
    `INSERT INTO users (username, full_name, password_hash, role, must_change_password, created_at, updated_at)
     VALUES ('admin', 'Administrator', ?, 'admin', 1, ?, ?)`,
    [bcrypt.hashSync(ctx.config.initialAdminPassword, 10), now, now],
  );
  ctx.logger.warn('Created default admin user "admin". You will be asked to change the password at first login.');
  return true;
}

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: ctx.config.cookieSecure,
    }),
  );
  app.use(compression({ filter: (req, res) => req.path !== '/api/events' && compression.filter(req, res) }));
  if (ctx.config.env !== 'test') {
    app.use(
      pinoHttp({
        logger: ctx.logger,
        autoLogging: { ignore: (req) => !req.url?.startsWith('/api') },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireClientHeader);
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: nowLocal() });
  });
  api.use('/auth', authRoutes(ctx));

  const secured = express.Router();
  secured.use(authenticate(ctx));
  secured.get('/events', ctx.events.subscribe);
  secured.use(ctx.events.middleware);
  secured.use('/users', userRoutes(ctx));
  secured.use('/settings', settingsRoutes(ctx));
  secured.use('/catalog', catalogRoutes(ctx));
  secured.use('/products', productRoutes(ctx));
  secured.use('/customers', customerRoutes(ctx));
  secured.use('/suppliers', supplierRoutes(ctx));
  secured.use('/sales', saleRoutes(ctx));
  secured.use('/quotations', quotationRoutes(ctx));
  secured.use('/held-bills', heldBillRoutes(ctx));
  secured.use('/purchases', purchaseRoutes(ctx));
  secured.use('/inventory', inventoryRoutes(ctx));
  secured.use('/payments', paymentRoutes(ctx));
  secured.use('/expenses', expenseRoutes(ctx));
  secured.use('/cashbook', cashbookRoutes(ctx));
  secured.use('/reports', reportRoutes(ctx));
  secured.use('/admin', adminRoutes(ctx));
  secured.use('/agreements', agreementRoutes(ctx));
  secured.use('/notifications', notificationRoutes(ctx));
  secured.use('/zakat', zakatRoutes(ctx));
  api.use(secured);

  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
  });

  app.use('/api', api);

  if (ctx.config.webDist) {
    const dist = ctx.config.webDist;
    app.use(
      express.static(dist, {
        index: false,
        maxAge: '7d',
        setHeaders: (res, file) => {
          if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    const indexHtml = path.join(dist, 'index.html');
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(fs.readFileSync(indexHtml, 'utf8'));
    });
  }

  app.use(errorHandler(ctx.logger));
  return app;
}
