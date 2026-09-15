import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import { AppError } from '../lib/errors';

interface SqliteLikeError extends Error {
  code?: string;
}

function sqliteMessage(err: SqliteLikeError): { status: number; code: string; message: string } | null {
  if (!err.code || !err.code.startsWith('SQLITE_')) return null;
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    const match = /UNIQUE constraint failed: ([\w.,\s]+)/.exec(err.message);
    const field = match ? match[1].split(',')[0].split('.').pop()?.trim().replace(/_/g, ' ') : 'value';
    return { status: 409, code: 'DUPLICATE', message: `A record with this ${field} already exists` };
  }
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return {
      status: 409,
      code: 'IN_USE',
      message: 'This record is linked to other records and cannot be removed. Deactivate it instead.',
    };
  }
  if (err.code === 'SQLITE_CONSTRAINT_CHECK' || err.code === 'SQLITE_CONSTRAINT_NOTNULL') {
    return { status: 400, code: 'INVALID', message: 'One or more values are invalid' };
  }
  if (err.code === 'SQLITE_BUSY') {
    return { status: 503, code: 'BUSY', message: 'The database is busy. Please try again.' };
  }
  return null;
}

export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: err.issues[0]?.message ?? 'Invalid input', details: err.issues },
      });
      return;
    }
    const e = err as SqliteLikeError & { type?: string; status?: number };
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
      return;
    }
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large' } });
      return;
    }
    const mapped = e ? sqliteMessage(e) : null;
    if (mapped) {
      logger.warn({ err: e, url: req.originalUrl }, 'database constraint error');
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      return;
    }
    logger.error({ err, url: req.originalUrl, method: req.method }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  };
}

export function requireClientHeader(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'XMLHttpRequest') {
    res.status(403).json({ error: { code: 'CSRF', message: 'Request rejected' } });
    return;
  }
  next();
}
