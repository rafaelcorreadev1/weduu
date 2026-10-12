import express, { type Express } from 'express';
import type { CallbackService } from './callback/run-finalizer.ts';
import type { Config } from './config.ts';
import type { Logger } from './logger.ts';
import type { CredentialProvider, PlatformClient } from './platform/types.ts';
import type { WorkQueue } from './queue/work-queue.ts';
import type { RunStore } from './runs/run-store.ts';
import type { RunStartedHandler, WorkItem } from './runs/types.ts';
import { adminRouter } from './http/routes/admin.ts';
import { checkRouter } from './http/routes/check.ts';
import { healthRouter } from './http/routes/health.ts';
import { processRouter } from './http/routes/process.ts';
import { errorHandler, notFound } from './http/middlewares/errors.ts';

export interface AppDeps {
  logger: Logger;
  config: Config;
  platform: PlatformClient;
  credentials: CredentialProvider;
  runs: RunStore;
  queue: WorkQueue<WorkItem>;
  callbacks: CallbackService;
  onRunStarted: RunStartedHandler;
}

export function createApp({
  logger,
  config,
  platform,
  credentials,
  runs,
  queue,
  callbacks,
  onRunStarted,
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter());
  app.use(checkRouter({ logger }));
  app.use(processRouter({ runs, queue, logger }));
  app.use(
    adminRouter({
      adminKey: config.adminKey,
      publicUrl: config.publicUrl,
      platform,
      credentials,
      onRunStarted,
      runs,
      callbacks,
      logger,
    }),
  );

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
