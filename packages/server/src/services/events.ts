import type { NextFunction, Request, Response } from 'express';
import type { LiveEvent } from '@pos/shared';
import { nowLocal } from '../lib/time';

const TOPICS: Record<string, string[]> = {
  sales: ['sales', 'products', 'customers', 'dashboard', 'cashbook', 'reports', 'quotations', 'held-bills', 'payments', 'notifications'],
  purchases: ['purchases', 'products', 'suppliers', 'dashboard', 'cashbook', 'reports', 'payments'],
  products: ['products', 'dashboard', 'reports'],
  inventory: ['products', 'inventory', 'dashboard', 'reports'],
  customers: ['customers', 'payments', 'cashbook', 'dashboard', 'reports', 'agreements', 'notifications'],
  suppliers: ['suppliers', 'payments', 'cashbook', 'dashboard', 'reports'],
  payments: ['payments', 'customers', 'suppliers', 'cashbook', 'dashboard', 'reports'],
  expenses: ['expenses', 'cashbook', 'dashboard', 'reports'],
  cashbook: ['cashbook'],
  catalog: ['catalog', 'products'],
  quotations: ['quotations'],
  'held-bills': ['held-bills'],
  settings: ['settings'],
  users: ['users'],
  agreements: ['agreements', 'customers'],
  zakat: ['zakat'],
  notifications: ['notifications'],
};

export class LiveEvents {
  private clients = new Set<Response>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) c.write(': ping\n\n');
    }, 25_000);
    this.heartbeat.unref();
  }

  get size() {
    return this.clients.size;
  }

  subscribe = (req: Request, res: Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`retry: 3000\n\n`);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  };

  broadcast(topics: string[]) {
    if (topics.length === 0 || this.clients.size === 0) return;
    const event: LiveEvent = { topics, at: nowLocal() };
    const payload = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
    for (const c of this.clients) c.write(payload);
  }

  middleware = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const segment = req.originalUrl.split('?')[0].replace(/^\/api\//, '').split('/')[0];
      const topics = TOPICS[segment];
      if (topics) this.broadcast(topics);
    });
    next();
  };

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.end();
    this.clients.clear();
  }
}
