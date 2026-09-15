import path from 'node:path';
import { Router } from 'express';
import type { AuditLog, Paginated } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { pagination, queryDay, queryString } from '../lib/http';
import { addDays } from '../lib/time';
import { escapeLike } from '../services/products';
import { createBackup, isValidBackupName, listBackups } from '../services/backup';
import fs from 'node:fs';

export function adminRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/backups', requirePermission('backup.manage'), (_req, res) => {
    res.json({ directory: ctx.config.backupDir, files: listBackups(ctx) });
  });

  router.post('/backups', requirePermission('backup.manage'), async (req, res) => {
    const file = await createBackup(ctx, 'manual');
    audit(db, actorOf(req), 'backup.create', 'backup', null, { file: file.name });
    res.status(201).json(file);
  });

  router.get('/backups/:name', requirePermission('backup.manage'), (req, res) => {
    const name = String(req.params.name);
    if (!isValidBackupName(name)) throw badRequest('Invalid backup file name');
    const file = path.join(ctx.config.backupDir, name);
    if (!fs.existsSync(file)) throw notFound('Backup file');
    audit(db, actorOf(req), 'backup.download', 'backup', null, { file: name });
    res.download(file, name);
  });

  router.get('/audit-logs', requirePermission('audit.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    const search = queryString(req.query, 'search');
    const params = {
      from: from ?? null,
      to: to ? addDays(to, 1) : null,
      search: search ? `%${escapeLike(search)}%` : null,
    };
    const where = `WHERE (@from IS NULL OR created_at >= @from) AND (@to IS NULL OR created_at < @to)
      AND (@search IS NULL OR action LIKE @search ESCAPE '\\' OR username LIKE @search ESCAPE '\\'
        OR details LIKE @search ESCAPE '\\')`;
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM audit_logs ${where}`, params)!.n;
    const data = all<AuditLog>(
      db,
      `SELECT id, user_id AS userId, username, action, entity_type AS entityType, entity_id AS entityId, details, ip,
         created_at AS createdAt FROM audit_logs ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit: pageSize, offset },
    );
    res.json({ data, total, page, pageSize } satisfies Paginated<AuditLog>);
  });

  return router;
}
