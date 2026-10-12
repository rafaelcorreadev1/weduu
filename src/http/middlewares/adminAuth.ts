import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function adminAuth(adminKey: string): RequestHandler {
  const expected = Buffer.from(adminKey);

  return (req, res, next) => {
    if (!adminKey) {
      res.status(503).json({ error: 'admin_disabled' });
      return;
    }

    const received = Buffer.from(req.get('x-admin-key') ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}
