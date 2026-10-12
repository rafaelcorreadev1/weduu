import type { Express } from 'express';
import { createApp } from './app.ts';
import { RunFinalizer } from './callback/run-finalizer.ts';
import type { Config } from './config.ts';
import { ConcurrencyLimiter } from './enrichment/limiter.ts';
import { EnrichmentWorker } from './enrichment/worker.ts';
import type { Logger } from './logger.ts';
import { createPlatformClient } from './platform/client.ts';
import type { CredentialProvider } from './platform/types.ts';
import { WorkQueue } from './queue/work-queue.ts';
import { createRetryPolicy } from './resilience/retry-policy.ts';
import { RunStore } from './runs/run-store.ts';
import type { WorkItem } from './runs/types.ts';

interface ServiceOptions {
  config: Config;
  logger: Logger;
  credentials: CredentialProvider;
}

export interface Service {
  app: Express;
  runs: RunStore;
  start(): void;
  stop(): void;
}

export function createService({ config, logger, credentials }: ServiceOptions): Service {
  const platform = createPlatformClient({
    baseUrl: config.platformBaseUrl,
    timeoutMs: config.platformTimeoutMs,
    enrichTimeoutMs: config.enrichTimeoutMs,
  });

  const runs = new RunStore();
  const queue = new WorkQueue<WorkItem>();

  const worker = new EnrichmentWorker({
    queue,
    runs,
    platform,
    credentials,
    limiter: new ConcurrencyLimiter({ maxConcurrency: config.enrichMaxConcurrency }),
    retryPolicy: createRetryPolicy({ maxAttempts: config.enrichMaxAttempts }),
    logger,
    // Mais itens ativos que vagas HTTP: itens dormindo em backoff não seguram a vaga de chamada.
    maxActiveItems: config.enrichMaxConcurrency * 4,
  });

  const finalizer = new RunFinalizer({
    runs,
    platform,
    credentials,
    retryPolicy: createRetryPolicy({ maxAttempts: 5 }),
    logger,
    idleTimeoutMs: config.runIdleTimeoutMs,
  });

  const app = createApp({
    logger,
    config,
    platform,
    credentials,
    runs,
    queue,
    callbacks: finalizer,
    onRunStarted: (run) => {
      runs.startRun(run);
      logger.info(run, 'run started');
    },
  });

  return {
    app,
    runs,
    start() {
      finalizer.start();
      worker.start();
    },
    stop() {
      worker.stop();
      finalizer.stop();
    },
  };
}
