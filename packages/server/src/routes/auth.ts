import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { permissionsForRole, type Role, type SessionUser } from '@pos/shared';
import type { AppContext, AuthUser } from '../context';
import { one, run, tx } from '../db';
import { authenticate, actorOf, SESSION_COOKIE, signSession } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, unauthorized } from '../lib/errors';
import { parse } from '../lib/http';
import { nowLocal } from '../lib/time';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(100, 'Password is too long');

function toSession(user: AuthUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions,
    mustChangePassword: user.mustChangePassword,
  };
}

export function authRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  const setCookie = (res: Response, token: string) => {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: ctx.config.cookieSecure,
      maxAge: ctx.config.sessionHours * 3600 * 1000,
      path: '/',
    });
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: ctx.config.env === 'test' ? 1000 : 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait a few minutes.' } },
  });

  router.post('/login', loginLimiter, (req, res) => {
    const body = parse(
      z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(100) }),
      req.body,
    );
    const user = one<{
      id: number;
      username: string;
      full_name: string;
      role: Role;
      password_hash: string;
      is_active: number;
      token_version: number;
      must_change_password: number;
    }>(db, 'SELECT * FROM users WHERE username = ?', [body.username]);

    const valid = bcrypt.compareSync(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      audit(db, null, 'auth.login_failed', 'user', user?.id ?? null, { username: body.username, ip: req.ip });
      throw unauthorized('Invalid username or password');
    }
    if (!user.is_active) throw unauthorized('This account has been deactivated');

    run(db, 'UPDATE users SET last_login_at = ? WHERE id = ?', [nowLocal(), user.id]);
    audit(db, { id: user.id, username: user.username, ip: req.ip }, 'auth.login', 'user', user.id);
    setCookie(res, signSession(ctx, user.id, user.token_version));
    res.json(
      toSession({
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        permissions: permissionsForRole(user.role),
        mustChangePassword: user.must_change_password === 1,
      }),
    );
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', authenticate(ctx), (req, res) => {
    res.json(toSession(req.user!));
  });

  router.post('/change-password', authenticate(ctx), (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
    const user = one<{ password_hash: string; token_version: number }>(
      db,
      'SELECT password_hash, token_version FROM users WHERE id = ?',
      [req.user!.id],
    );
    if (!user || !bcrypt.compareSync(body.currentPassword, user.password_hash)) {
      throw badRequest('Current password is incorrect');
    }
    if (body.currentPassword === body.newPassword) throw badRequest('New password must be different');
    const newVersion = user.token_version + 1;
    tx(db, () => {
      run(
        db,
        'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = ?, updated_at = ? WHERE id = ?',
        [bcrypt.hashSync(body.newPassword, 10), newVersion, nowLocal(), req.user!.id],
      );
      audit(db, actorOf(req), 'auth.password_changed', 'user', req.user!.id);
    });
    setCookie(res, signSession(ctx, req.user!.id, newVersion));
    res.json(toSession({ ...req.user!, mustChangePassword: false }));
  });

  return router;
}
