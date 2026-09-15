import { run, type DB } from '../db';
import { nowLocal } from './time';

export interface Actor {
  id: number;
  username: string;
  ip?: string | null;
}

export function audit(
  db: DB,
  actor: Actor | null,
  action: string,
  entityType: string | null = null,
  entityId: number | bigint | null = null,
  details: unknown = null,
) {
  run(
    db,
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip, created_at)
     VALUES (@userId, @username, @action, @entityType, @entityId, @details, @ip, @now)`,
    {
      userId: actor?.id ?? null,
      username: actor?.username ?? null,
      action,
      entityType,
      entityId: entityId === null ? null : Number(entityId),
      details: details === null ? null : typeof details === 'string' ? details : JSON.stringify(details),
      ip: actor?.ip ?? null,
      now: nowLocal(),
    },
  );
}
