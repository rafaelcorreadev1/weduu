import { Router } from 'express';
import type { Logger } from '../../logger.ts';
import { isNonEmptyString } from '../validation.ts';

export function checkRouter({ logger }: { logger: Logger }): Router {
  const router = Router();
  router.post('/check', (req, res) => {
    const token: unknown = req.body?.token;
    if (!isNonEmptyString(token)) {
      res.status(400).json({ error: 'invalid_token' });
      return;
    }

    logger.info('webhook handshake received');
    res.json({ token });
  });
  return router;
}
