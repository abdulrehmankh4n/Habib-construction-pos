import type { Express } from 'express';
import { createApp, ensureAdminUser } from './app';
import { loadConfig } from './config';
import { migrate, openDatabase } from './db';
import { createLogger } from './logger';
import { setTimezone } from './lib/time';
import type { AppContext } from './context';
import { LiveEvents } from './services/events';
import { restoreDataDir, schedulePersistDataDir } from './vercel/blob-data';

const VERCEL_DATA_DIR = '/tmp/pos-data';

let cachedApp: Express | null = null;

export async function createServerlessApp(): Promise<Express> {
  if (cachedApp) return cachedApp;

  await restoreDataDir(VERCEL_DATA_DIR);

  const config = loadConfig({
    dataDir: VERCEL_DATA_DIR,
    cookieSecure: true,
    webDist: null,
  });
  const logger = createLogger(config.logLevel, undefined);
  setTimezone(config.timezone);

  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  if (applied > 0) logger.info({ applied }, 'database migrations applied');

  const events = new LiveEvents();
  const ctx: AppContext = { db, config, logger, events };
  ensureAdminUser(ctx);

  const app = createApp(ctx);
  attachPersist(app, ctx, db);

  cachedApp = app;
  return app;
}

function attachPersist(app: Express, ctx: AppContext, db: ReturnType<typeof openDatabase>) {
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.on('finish', () => {
        if (res.statusCode < 500) schedulePersistDataDir(ctx.config.dataDir, db);
      });
    }
    next();
  });
}
