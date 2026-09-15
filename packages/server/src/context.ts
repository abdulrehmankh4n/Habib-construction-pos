import type { Logger } from 'pino';
import type { Permission, Role } from '@pos/shared';
import type { AppConfig } from './config';
import type { DB } from './db';
import type { LiveEvents } from './services/events';

export interface AppContext {
  db: DB;
  config: AppConfig;
  logger: Logger;
  events: LiveEvents;
}

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
