import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';

let appPromise: Promise<Express> | null = null;

function loadApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = import('../packages/server/dist/serverless.js').then((m) => m.createServerlessApp());
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await loadApp();
  app(req, res);
}
