import { Router } from 'express';
import { z } from 'zod';
import type { Sequence } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx } from '../db';
import { actorOf, can, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { notFound, unprocessable } from '../lib/errors';
import { parse } from '../lib/http';
import { getSettings, publicSettings, updateSettings } from '../lib/settings';

const MASK = '••••••••';

export function settingsRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/', (req, res) => {
    res.json(publicSettings(getSettings(db), can(req, 'settings.manage')));
  });

  router.put('/', requirePermission('settings.manage'), (req, res) => {
    const patch = parse(z.record(z.unknown()), req.body);
    const fbr = patch.fbr as Record<string, unknown> | undefined;
    if (fbr && fbr.token === MASK) delete fbr.token;
    const updated = tx(db, () => {
      const s = updateSettings(db, patch);
      audit(db, actorOf(req), 'settings.update', 'settings', null, Object.keys(patch));
      return s;
    });
    res.json(publicSettings(updated, true));
  });

  router.get('/sequences', requirePermission('settings.manage'), (_req, res) => {
    res.json(
      all<Sequence>(
        db,
        'SELECT name, prefix, next_value AS nextValue, padding FROM sequences ORDER BY name',
      ),
    );
  });

  router.put('/sequences/:name', requirePermission('settings.manage'), (req, res) => {
    const name = String(req.params.name);
    const body = parse(
      z.object({
        prefix: z
          .string()
          .trim()
          .max(12)
          .regex(/^[A-Za-z0-9/_-]*$/, 'Prefix may contain letters, numbers, / _ and -'),
        nextValue: z.coerce.number().int().min(1),
        padding: z.coerce.number().int().min(1).max(12),
      }),
      req.body,
    );
    const current = one<{ next_value: number }>(db, 'SELECT next_value FROM sequences WHERE name = ?', [name]);
    if (!current) throw notFound('Sequence');
    if (body.nextValue < current.next_value) {
      throw unprocessable(`Next number cannot be lower than ${current.next_value} (prevents duplicate numbers)`);
    }
    tx(db, () => {
      run(db, 'UPDATE sequences SET prefix = @prefix, next_value = @nextValue, padding = @padding WHERE name = @name', {
        ...body,
        name,
      });
      audit(db, actorOf(req), 'sequence.update', 'sequence', null, { name, ...body });
    });
    res.json({ ok: true });
  });

  return router;
}
