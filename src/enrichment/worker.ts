import type { Logger } from '../logger.ts';
import { PlatformError } from '../platform/errors.ts';
import type { CredentialProvider, EnrichResponse, PlatformClient } from '../platform/types.ts';
import type { WorkQueue } from '../queue/work-queue.ts';
import type { RunStore } from '../runs/run-store.ts';
import type { WorkItem } from '../runs/types.ts';
import type { ConcurrencyLimiter } from './limiter.ts';
import type { RetryPolicy, RetryState } from '../resilience/retry-policy.ts';
import { realSleep, type Sleep } from '../resilience/timing.ts';

interface WorkerDeps {
  queue: WorkQueue<WorkItem>;
  runs: RunStore;
  platform: PlatformClient;
  credentials: CredentialProvider;
  limiter: ConcurrencyLimiter;
  retryPolicy: RetryPolicy;
  logger: Logger;
  maxActiveItems: number;
  sleep?: Sleep;
}

class NotRegisteredError extends Error {
  constructor() {
    super('no credentials available');
    this.name = 'NotRegisteredError';
  }
}

export class EnrichmentWorker {
  readonly #deps: Required<WorkerDeps>;
  readonly #cache = new Map<string, Map<string, Promise<EnrichResponse>>>();
  readonly #idleWaiters: Array<() => void> = [];
  #active = 0;
  #unsubscribe: (() => void) | null = null;

  constructor(deps: WorkerDeps) {
    this.#deps = { sleep: realSleep, ...deps };
  }

  start(): void {
    this.#unsubscribe ??= this.#deps.queue.onAvailable(() => this.#pump());
    this.#pump();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  idle(): Promise<void> {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  #pump(): void {
    while (this.#active < this.#deps.maxActiveItems) {
      const item = this.#deps.queue.dequeue();
      if (!item) break;

      this.#active += 1;
      void this.#process(item).finally(() => {
        this.#active -= 1;
        this.#pump();
        if (this.#isIdle()) this.#idleWaiters.splice(0).forEach((resolve) => resolve());
      });
    }
  }

  #isIdle(): boolean {
    return this.#active === 0 && this.#deps.queue.size === 0;
  }

  async #process(item: WorkItem): Promise<void> {
    const { runs, logger } = this.#deps;
    try {
      const { price, stock } = await this.#enrichOnce(item);
      runs.markDone(item.runId, item.seq, { price, stock });
      logger.debug({ ...item, price, stock }, 'item enriched');
    } catch (err) {
      const reason = failureReason(err);
      runs.markFailed(item.runId, item.seq, reason);
      logger.warn({ ...item, reason, err: reason === 'internal' ? err : undefined }, 'item failed');
    }
  }

  #enrichOnce({ runId, sku }: WorkItem): Promise<EnrichResponse> {
    let runCache = this.#cache.get(runId);
    if (!runCache) {
      runCache = new Map();
      this.#cache.set(runId, runCache);
    }

    const cached = runCache.get(sku);
    if (cached) return cached;

    const pending = this.#enrichWithRetry(runId, sku);
    runCache.set(sku, pending);
    pending.catch((err: unknown) => {
      const definitive = err instanceof PlatformError && err.kind === 'not_found';
      if (!definitive) runCache.delete(sku);
    });
    return pending;
  }

  async #enrichWithRetry(runId: string, sku: string): Promise<EnrichResponse> {
    const { platform, credentials, limiter, retryPolicy, runs, logger, sleep } = this.#deps;
    const state: RetryState = { attempts: 0, rateLimitHits: 0 };

    for (;;) {
      const creds = credentials.get();
      if (!creds) throw new NotRegisteredError();

      try {
        return await limiter.run(() => {
          runs.recordEnrichCall(runId);
          return platform.enrich(sku, creds);
        });
      } catch (err) {
        const rateLimited = err instanceof PlatformError && err.kind === 'rate_limited';
        if (rateLimited) {
          state.rateLimitHits += 1;
        } else {
          state.attempts += 1;
          state.rateLimitHits = 0;
        }

        const delay = retryPolicy(err, state);
        if (delay === null) throw err;

        if (rateLimited) limiter.pauseFor(delay);
        logger.debug({ runId, sku, kind: (err as PlatformError).kind, delay, ...state }, 'retrying enrich');
        await sleep(delay);
      }
    }
  }
}

function failureReason(err: unknown): string {
  if (err instanceof PlatformError) return err.kind;
  if (err instanceof NotRegisteredError) return 'not_registered';
  return 'internal';
}
