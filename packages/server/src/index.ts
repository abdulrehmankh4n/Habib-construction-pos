import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { migrate, openDatabase } from './db';
import { setTimezone } from './lib/time';
import { createApp, ensureAdminUser } from './app';
import type { AppContext } from './context';
import { startAutoBackup } from './services/backup';
import { LiveEvents } from './services/events';
import { startFbrWorker } from './services/fbr';

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

async function main() {
  const config = loadConfig();
  if (config.https) config.cookieSecure = true;
  const logger = createLogger(config.logLevel, config.env === 'production' ? config.dataDir : undefined);
  setTimezone(config.timezone);

  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  if (applied > 0) logger.info({ applied }, 'database migrations applied');

  const events = new LiveEvents();
  const ctx: AppContext = { db, config, logger, events };
  ensureAdminUser(ctx);

  const app = createApp(ctx);
  const server = config.https ? https.createServer(config.https, app) : http.createServer(app);
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 60_000;
  server.listen(config.port, config.host, () => {
    const scheme = config.https ? 'https' : 'http';
    logger.info(
      {
        local: `${scheme}://localhost:${config.port}`,
        network: lanAddresses().map((a) => `${scheme}://${a}:${config.port}`),
        database: config.dbPath,
        frontend: config.webDist ? 'bundled' : 'not built (API only)',
      },
      'Construction POS server started',
    );
  });

  const stopBackup = startAutoBackup(ctx);
  const stopFbr = startFbrWorker(ctx);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    stopBackup();
    stopFbr();
    events.close();
    server.close(() => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
