import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { permissionsForRole, type Permission, type Role } from '@pos/shared';
import type { AppContext, AuthUser } from '../context';
import { one } from '../db';
import { forbidden, unauthorized, AppError } from '../lib/errors';
import type { Actor } from '../lib/audit';

export const SESSION_COOKIE = 'pos_session';

interface TokenPayload {
  sub: number;
  tv: number;
}

interface UserAuthRow {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: number;
  token_version: number;
  must_change_password: number;
}

const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

export function signSession(ctx: AppContext, userId: number, tokenVersion: number): string {
  return jwt.sign({ sub: userId, tv: tokenVersion } satisfies TokenPayload, ctx.config.jwtSecret, {
    expiresIn: `${ctx.config.sessionHours}h`,
  });
}

function readToken(req: Request): string | null {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (typeof cookie === 'string' && cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function authenticate(ctx: AppContext) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (!token) throw unauthorized();
    let payload: TokenPayload;
    try {
      const decoded = jwt.verify(token, ctx.config.jwtSecret);
      if (typeof decoded !== 'object' || decoded === null) throw new Error('bad token');
      payload = { sub: Number(decoded.sub), tv: Number((decoded as Record<string, unknown>).tv) };
    } catch {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
    const user = one<UserAuthRow>(
      ctx.db,
      'SELECT id, username, full_name, role, is_active, token_version, must_change_password FROM users WHERE id = ?',
      [payload.sub],
    );
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      throw unauthorized('Your session is no longer valid. Please sign in again.');
    }
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      permissions: permissionsForRole(user.role),
      mustChangePassword: user.must_change_password === 1,
    };
    const path = req.originalUrl.split('?')[0];
    if (authUser.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(path)) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please change your password before continuing');
    }
    req.user = authUser;
    next();
  };
}

export function can(req: Request, permission: Permission): boolean {
  return !!req.user?.permissions.includes(permission);
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!permissions.some((p) => req.user!.permissions.includes(p))) throw forbidden();
    next();
  };
}

export function actorOf(req: Request): Actor {
  if (!req.user) throw unauthorized();
  return { id: req.user.id, username: req.user.username, ip: req.ip ?? null };
}
