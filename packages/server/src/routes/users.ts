import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ROLES, type User } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { notFound, unprocessable } from '../lib/errors';
import { idParam, parse, zs } from '../lib/http';
import { nowLocal } from '../lib/time';
import { passwordSchema } from './auth';

const USER_SELECT = `SELECT id, username, full_name AS fullName, phone, role, is_active AS isActive,
  must_change_password AS mustChangePassword, last_login_at AS lastLoginAt, created_at AS createdAt FROM users`;

function mapUser(row: User): User {
  return { ...row, isActive: !!row.isActive, mustChangePassword: !!row.mustChangePassword };
}

export function userRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  router.use(requirePermission('users.manage'));

  const activeAdminCount = (excludeId: number) =>
    one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", [
      excludeId,
    ])!.n;

  router.get('/', (_req, res) => {
    res.json(all<User>(db, `${USER_SELECT} ORDER BY is_active DESC, full_name`).map(mapUser));
  });

  router.post('/', (req, res) => {
    const body = parse(
      z.object({
        username: z
          .string()
          .trim()
          .min(3, 'Username must be at least 3 characters')
          .max(40)
          .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dot, dash and underscore'),
        fullName: zs.name(),
        phone: zs.phone,
        role: z.enum(ROLES),
        password: passwordSchema,
      }),
      req.body,
    );
    const now = nowLocal();
    const id = tx(db, () => {
      const r = run(
        db,
        `INSERT INTO users (username, full_name, phone, password_hash, role, must_change_password, created_at, updated_at)
         VALUES (@username, @fullName, @phone, @hash, @role, 1, @now, @now)`,
        { ...body, hash: bcrypt.hashSync(body.password, 10), now },
      );
      audit(db, actorOf(req), 'user.create', 'user', r.lastInsertRowid, { username: body.username, role: body.role });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(mapUser(one<User>(db, `${USER_SELECT} WHERE id = ?`, [id])!));
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req);
    const body = parse(
      z.object({ fullName: zs.name(), phone: zs.phone, role: z.enum(ROLES), isActive: z.boolean() }),
      req.body,
    );
    const existing = one<{ id: number; role: string }>(db, 'SELECT id, role FROM users WHERE id = ?', [id]);
    if (!existing) throw notFound('User');
    if (id === req.user!.id && (!body.isActive || body.role !== 'admin')) {
      throw unprocessable('You cannot deactivate or demote your own account');
    }
    if (existing.role === 'admin' && (body.role !== 'admin' || !body.isActive) && activeAdminCount(id) === 0) {
      throw unprocessable('At least one active administrator is required');
    }
    tx(db, () => {
      run(
        db,
        `UPDATE users SET full_name = @fullName, phone = @phone, role = @role, is_active = @isActive,
           token_version = token_version + CASE WHEN @isActive = 0 OR role != @role THEN 1 ELSE 0 END,
           updated_at = @now WHERE id = @id`,
        { ...body, id, now: nowLocal() },
      );
      audit(db, actorOf(req), 'user.update', 'user', id, body);
    });
    res.json(mapUser(one<User>(db, `${USER_SELECT} WHERE id = ?`, [id])!));
  });

  router.post('/:id/reset-password', (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ password: passwordSchema }), req.body);
    const existing = one<{ id: number }>(db, 'SELECT id FROM users WHERE id = ?', [id]);
    if (!existing) throw notFound('User');
    tx(db, () => {
      run(
        db,
        `UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1, updated_at = ?
         WHERE id = ?`,
        [bcrypt.hashSync(body.password, 10), nowLocal(), id],
      );
      audit(db, actorOf(req), 'user.reset_password', 'user', id);
    });
    res.json({ ok: true });
  });

  return router;
}
