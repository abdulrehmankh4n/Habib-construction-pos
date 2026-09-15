import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().default(''),
  TZ_NAME: z.string().default('Asia/Karachi'),
  JWT_SECRET: z.string().optional(),
  SESSION_HOURS: z.coerce.number().min(1).max(168).default(12),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  INITIAL_ADMIN_PASSWORD: z.string().min(6).default('admin123'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_DIST: z.string().optional(),
  HTTPS_CERT_FILE: z.string().optional(),
  HTTPS_KEY_FILE: z.string().optional(),
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  backupDir: string;
  timezone: string;
  jwtSecret: string;
  sessionHours: number;
  cookieSecure: boolean;
  initialAdminPassword: string;
  logLevel: string;
  webDist: string | null;
  https: { cert: string; key: string } | null;
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (Array.isArray(json.workspaces)) return dir;
      } catch {
        // continue searching upwards
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function loadDotEnv(root: string) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveSecret(dataDir: string, provided?: string): string {
  if (provided && provided.length >= 32) return provided;
  if (provided) throw new Error('JWT_SECRET must be at least 32 characters long');
  const file = path.join(dataDir, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  loadDotEnv(root);
  const env = envSchema.parse(process.env);

  const dataDir = overrides.dataDir ?? path.resolve(root, env.DATA_DIR || 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const backupDir = overrides.backupDir ?? path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const defaultWebDist = path.resolve(root, 'packages', 'web', 'dist');
  const webDist = env.WEB_DIST ? path.resolve(env.WEB_DIST) : defaultWebDist;

  let https: AppConfig['https'] = null;
  const defaultCert = path.join(dataDir, 'certs', 'server.crt');
  const defaultKey = path.join(dataDir, 'certs', 'server.key');
  const certFile = env.HTTPS_CERT_FILE ? path.resolve(root, env.HTTPS_CERT_FILE) : defaultCert;
  const keyFile = env.HTTPS_KEY_FILE ? path.resolve(root, env.HTTPS_KEY_FILE) : defaultKey;
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    https = { cert: fs.readFileSync(certFile, 'utf8'), key: fs.readFileSync(keyFile, 'utf8') };
  } else if (env.HTTPS_CERT_FILE || env.HTTPS_KEY_FILE) {
    throw new Error(`HTTPS certificate or key file not found (${certFile}, ${keyFile})`);
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    dataDir,
    dbPath: path.join(dataDir, 'pos.db'),
    backupDir,
    timezone: env.TZ_NAME,
    jwtSecret: resolveSecret(dataDir, env.JWT_SECRET),
    sessionHours: env.SESSION_HOURS,
    cookieSecure: env.COOKIE_SECURE,
    initialAdminPassword: env.INITIAL_ADMIN_PASSWORD,
    logLevel: env.LOG_LEVEL,
    webDist: fs.existsSync(path.join(webDist, 'index.html')) ? webDist : null,
    https,
    ...overrides,
  };
}
