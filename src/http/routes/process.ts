import { Router } from 'express';
import type { Logger } from '../../logger.ts';
import type { WorkQueue } from '../../queue/work-queue.ts';
import type { RunStore } from '../../runs/run-store.ts';
import type { WorkItem } from '../../runs/types.ts';
import { isNonEmptyString } from '../validation.ts';

interface ProcessRouterDeps {
  runs: RunStore;
  queue: WorkQueue<WorkItem>;
  logger: Logger;
}

export function processRouter({ runs, queue, logger }: ProcessRouterDeps): Router {
  const router = Router();

  // Handler síncrono de propósito: nenhum await pode entrar no caminho do ACK (SLA de 600ms).
  router.post('/process', (req, res) => {
    const item = parseMessage(req.body);
    if (!item) {
      logger.warn({ body: req.body }, 'invalid process message');
      res.status(400).json({ error: 'invalid_message' });
      return;
    }

    const result = runs.recordMessage(item);
    if (result.outcome === 'accepted') {
      queue.enqueue(item);
      logger.debug(item, 'message accepted');
    } else if (result.knownSku !== item.sku) {
      logger.warn({ ...item, knownSku: result.knownSku }, 'duplicate message with different sku');
    } else {
      logger.info({ runId: item.runId, seq: item.seq }, 'duplicate message ignored');
    }

    res.json({ ok: true });
  });

  return router;
}

function parseMessage(body: unknown): WorkItem | null {
  const { run_id, seq, sku } = (body ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(run_id) || !isNonEmptyString(sku)) return null;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) return null;
  return { runId: run_id, seq, sku };
}
