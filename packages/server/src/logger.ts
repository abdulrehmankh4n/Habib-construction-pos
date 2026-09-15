import fs from 'node:fs';
import path from 'node:path';
import pino, { type Logger } from 'pino';

export function createLogger(level: string, dataDir?: string): Logger {
  const streams: pino.StreamEntry[] = [{ level: level as pino.Level, stream: process.stdout }];
  if (dataDir) {
    const logDir = path.join(dataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    streams.push({
      level: level as pino.Level,
      stream: pino.destination({ dest: path.join(logDir, 'app.log'), mkdir: true, sync: false }),
    });
  }
  return pino(
    {
      level,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'password', '*.password'],
    },
    pino.multistream(streams),
  );
}
