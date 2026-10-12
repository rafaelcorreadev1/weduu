import { Router, type Response } from 'express';
import type { CallbackService, CallbackView } from '../../callback/run-finalizer.ts';
import type { Logger } from '../../logger.ts';
import { PlatformError } from '../../platform/errors.ts';
import type { CredentialProvider, PlatformClient } from '../../platform/types.ts';
import type { RunStore } from '../../runs/run-store.ts';
import type { RunStartedHandler } from '../../runs/types.ts';
import { adminAuth } from '../middlewares/adminAuth.ts';
import { isNonEmptyString } from '../validation.ts';

interface AdminRouterDeps {
  adminKey: string;
  publicUrl: string;
  platform: PlatformClient;
  credentials: CredentialProvider;
  onRunStarted: RunStartedHandler;
  runs: RunStore;
  callbacks: CallbackService;
  logger: Logger;
}

export function adminRouter({
  adminKey,
  publicUrl,
  platform,
  credentials,
  onRunStarted,
  runs,
  callbacks,
  logger,
}: AdminRouterDeps): Router {
  const router = Router();
  router.use('/admin', adminAuth(adminKey));

  router.post('/admin/register', async (req, res) => {
    const name: unknown = req.body?.name;
    const webhook: unknown = req.body?.webhook || publicUrl;
    if (!isNonEmptyString(name) || !isNonEmptyString(webhook)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    try {
      const { cid, token } = await platform.register({ name, webhook });
      await credentials.save({ cid, token });
      logger.info({ cid, webhook }, 'registered on platform');
      res.json({ cid });
    } catch (err) {
      if (err instanceof PlatformError && err.kind === 'handshake_failed') {
        const reason = (err.body as { reason?: string } | null)?.reason ?? null;
        logger.warn({ reason }, 'handshake failed');
        res.status(422).json({ error: 'handshake_failed', reason });
        return;
      }
      respondPlatformFailure(res, err, logger);
    }
  });

  router.post('/admin/burst', async (req, res) => {
    const creds = credentials.get();
    if (!creds) {
      res.status(409).json({ error: 'not_registered' });
      return;
    }

    try {
      const { run_id, total, started_at } = await platform.requestBurst(creds);
      onRunStarted({ runId: run_id, total, startedAt: started_at });
      res.json({ run_id, total, started_at });
    } catch (err) {
      respondPlatformFailure(res, err, logger);
    }
  });

  router.get('/admin/runs/:runId', (req, res) => {
    const run = runs.get(req.params.runId);
    if (!run) {
      res.status(404).json({ error: 'run_not_found' });
      return;
    }

    res.json({
      run_id: run.runId,
      total: run.total,
      started_at: run.startedAt,
      received: run.received,
      duplicates: run.duplicates,
      pending: run.pending,
      done: run.done,
      failed: run.failed,
      enrich_calls: run.enrichCalls,
      callback: callbackJson(callbacks.callback(run.runId)),
    });
  });

  router.post('/admin/runs/:runId/callback', async (req, res) => {
    const result = await callbacks.resend(req.params.runId);
    switch (result.outcome) {
      case 'run_not_found':
        res.status(404).json({ error: 'run_not_found' });
        return;
      case 'in_progress':
        res.status(409).json({ error: 'callback_in_progress' });
        return;
      default:
        res.json(callbackJson(result.callback));
    }
  });

  return router;
}

function callbackJson(callback: CallbackView | undefined) {
  if (!callback) return { status: 'idle' };
  return {
    status: callback.status,
    reason: callback.reason,
    attempts: callback.attempts,
    error: callback.error,
    sent_at: callback.sentAt,
    response: callback.response,
  };
}

function respondPlatformFailure(res: Response, err: unknown, logger: Logger): void {
  if (!(err instanceof PlatformError)) throw err;

  logger.error({ kind: err.kind, status: err.status, body: err.body }, 'platform call failed');
  const error = err.kind === 'unauthorized' ? 'platform_unauthorized' : 'platform_unavailable';
  res.status(502).json({ error });
}
