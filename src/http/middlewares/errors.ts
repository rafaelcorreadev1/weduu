import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../../logger.ts';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'not_found' });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  // Express só reconhece error handlers com 4 parâmetros, por isso o `next` não usado.
  return (err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }

    logger.error({ err, method: req.method, path: req.path }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  };
}
