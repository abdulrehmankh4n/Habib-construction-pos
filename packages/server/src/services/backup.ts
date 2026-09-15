import fs from 'node:fs';
import path from 'node:path';
import type { BackupFile } from '@pos/shared';
import type { AppContext } from '../context';
import { getSettings } from '../lib/settings';
import { nowLocal } from '../lib/time';

const NAME_PATTERN = /^(auto|manual)-\d{8}-\d{6}\.db$/;

export function isValidBackupName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function listBackups(ctx: AppContext): BackupFile[] {
  if (!fs.existsSync(ctx.config.backupDir)) return [];
  return fs
    .readdirSync(ctx.config.backupDir)
    .filter(isValidBackupName)
    .map((name) => {
      const stat = fs.statSync(path.join(ctx.config.backupDir, name));
      return { name, size: stat.size, createdAt: nowLocal(stat.mtime) };
    })
    .sort((a, b) => b.name.slice(-18).localeCompare(a.name.slice(-18)));
}

function prune(ctx: AppContext, kind: 'auto' | 'manual') {
  const keep = getSettings(ctx.db).backup.retentionCount;
  const files = listBackups(ctx).filter((f) => f.name.startsWith(`${kind}-`));
  for (const f of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(ctx.config.backupDir, f.name));
    } catch (err) {
      ctx.logger.warn({ err, file: f.name }, 'failed to remove old backup');
    }
  }
}

export async function createBackup(ctx: AppContext, kind: 'auto' | 'manual'): Promise<BackupFile> {
  fs.mkdirSync(ctx.config.backupDir, { recursive: true });
  const stamp = nowLocal().replace(/[-:]/g, '').replace(' ', '-');
  let name = `${kind}-${stamp}.db`;
  let n = 0;
  while (fs.existsSync(path.join(ctx.config.backupDir, name)) && n < 5) {
    await new Promise((r) => setTimeout(r, 1100));
    name = `${kind}-${nowLocal().replace(/[-:]/g, '').replace(' ', '-')}.db`;
    n++;
  }
  const target = path.join(ctx.config.backupDir, name);
  await ctx.db.backup(target);
  prune(ctx, kind);
  const stat = fs.statSync(target);
  ctx.logger.info({ file: name, size: stat.size }, 'database backup created');
  return { name, size: stat.size, createdAt: nowLocal(stat.mtime) };
}

export function startAutoBackup(ctx: AppContext): () => void {
  const check = async () => {
    try {
      if (!getSettings(ctx.db).backup.autoEnabled) return;
      const latest = listBackups(ctx).find((b) => b.name.startsWith('auto-'));
      const today = nowLocal().slice(0, 10);
      if (latest && latest.createdAt.slice(0, 10) === today) return;
      await createBackup(ctx, 'auto');
    } catch (err) {
      ctx.logger.error({ err }, 'automatic backup failed');
    }
  };
  const initial = setTimeout(check, 15_000);
  const timer = setInterval(check, 60 * 60 * 1000);
  initial.unref();
  timer.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
