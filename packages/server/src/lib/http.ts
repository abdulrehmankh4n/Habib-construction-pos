import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors';
import { isValidDay } from './time';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw badRequest(first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input', issues);
  }
  return result.data;
}

export function idParam(req: Request, name = 'id'): number {
  const value = Number(req.params[name]);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(`Invalid ${name}`);
  return value;
}

export function pagination(query: Request['query'], maxSize = 200) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(maxSize, Math.max(1, Math.floor(Number(query.pageSize) || 50)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function queryString(query: Request['query'], key: string): string | undefined {
  const v = query[key];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export function queryInt(query: Request['query'], key: string): number | undefined {
  const v = queryString(query, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw badRequest(`Invalid ${key}`);
  return n;
}

export function queryDay(query: Request['query'], key: string): string | undefined {
  const v = queryString(query, key);
  if (v === undefined) return undefined;
  if (!isValidDay(v)) throw badRequest(`Invalid ${key} date, expected YYYY-MM-DD`);
  return v;
}

export function queryBool(query: Request['query'], key: string): boolean | undefined {
  const v = queryString(query, key);
  if (v === undefined) return undefined;
  return v === 'true' || v === '1';
}

export const zs = {
  id: z.coerce.number().int().positive(),
  optId: z.coerce.number().int().positive().nullable().optional(),
  money: z.coerce.number().int('Amount must be in paisa (integer)').min(0).max(1e13),
  optMoney: z.coerce.number().int().min(0).max(1e13).nullable().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero').max(1e9),
  text: (max = 200) =>
    z
      .string()
      .trim()
      .max(max)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
  name: (max = 120) => z.string().trim().min(1, 'Required').max(max),
  day: z.string().refine(isValidDay, 'Invalid date, expected YYYY-MM-DD'),
  phone: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9+\-\s()]{7,20}$/.test(v), 'Invalid phone number'),
  cnic: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{5}-?\d{7}-?\d$/.test(v), 'CNIC must be 13 digits (e.g. 35202-1234567-1)')
    .transform((v) => (v ? v.replace(/^(\d{5})-?(\d{7})-?(\d)$/, '$1-$2-$3') : null)),
  bool: z.boolean(),
};
