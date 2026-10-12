import type { RetryPolicy, RetryState } from '../resilience/retry-policy.ts';
import { realSleep, type Sleep } from '../resilience/timing.ts';
import type { Logger } from '../logger.ts';
import { PlatformError } from '../platform/errors.ts';
import type { CallbackPayload, Credentials, CredentialProvider, PlatformClient } from '../platform/types.ts';
import type { RunStore } from '../runs/run-store.ts';
import { buildResult } from './consolidate.ts';

export type CallbackReason = 'complete' | 'idle_timeout' | 'manual';
export type CallbackStatus = 'idle' | 'sending' | 'sent' | 'failed';

export interface CallbackView {
  status: CallbackStatus;
  reason: CallbackReason | null;
  attempts: number;
  error: string | null;
  sentAt: string | null;
  response: unknown;
}

export type ResendOutcome =
  | { outcome: 'sent' | 'failed'; callback: CallbackView }
  | { outcome: 'run_not_found' | 'in_progress' };

export interface CallbackService {
  callback(runId: string): CallbackView | undefined;
  resend(runId: string): Promise<ResendOutcome>;
}

interface CallbackState extends CallbackView {
  everSent: boolean;
  sentComplete: boolean;
  scheduled: boolean;
  dirty: boolean;
}

interface FinalizerDeps {
  runs: RunStore;
  platform: PlatformClient;
  credentials: CredentialProvider;
  retryPolicy: RetryPolicy;
  logger: Logger;
  idleTimeoutMs: number;
  sleep?: Sleep;
}

export class RunFinalizer implements CallbackService {
  readonly #deps: Required<FinalizerDeps>;
  readonly #states = new Map<string, CallbackState>();
  readonly #timers = new Map<string, NodeJS.Timeout>();
  #unsubscribe: (() => void) | null = null;

  constructor(deps: FinalizerDeps) {
    this.#deps = { sleep: realSleep, ...deps };
  }

  start(): void {
    this.#unsubscribe ??= this.#deps.runs.onChange((runId) => this.#evaluate(runId));
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }

  callback(runId: string): CallbackView | undefined {
    const state = this.#states.get(runId);
    return state ? toView(state) : undefined;
  }

  async resend(runId: string): Promise<ResendOutcome> {
    if (!this.#deps.runs.get(runId)) return { outcome: 'run_not_found' };
    const state = this.#state(runId);
    if (state.status === 'sending') return { outcome: 'in_progress' };

    await this.#send(runId, 'manual');
    return { outcome: state.status === 'sent' ? 'sent' : 'failed', callback: toView(state) };
  }

  // Roda dentro do handler do /process: só decide e agenda, nunca faz I/O aqui.
  #evaluate(runId: string): void {
    const state = this.#state(runId);
    if (state.status === 'sending') {
      state.dirty = true;
      return;
    }

    if (this.#deps.runs.isComplete(runId)) {
      this.#clearTimer(runId);
      if (!state.sentComplete) this.#schedule(runId, 'complete');
      return;
    }

    this.#armIdleTimer(runId);
  }

  #onIdle(runId: string): void {
    this.#timers.delete(runId);
    const { runs, logger } = this.#deps;
    const run = runs.get(runId);
    const state = this.#state(runId);
    if (!run || state.status === 'sending' || runs.isComplete(runId)) return;

    if (run.pending > 0) {
      this.#armIdleTimer(runId);
      return;
    }

    if (!state.everSent) {
      logger.warn({ runId, total: run.total, received: run.received, missing: runs.missingSeqs(runId) }, 'run idle: sending partial callback');
      this.#schedule(runId, 'idle_timeout');
    }
  }

  #schedule(runId: string, reason: CallbackReason): void {
    const state = this.#state(runId);
    if (state.scheduled) return;
    state.scheduled = true;
    setImmediate(() => {
      state.scheduled = false;
      void this.#send(runId, reason);
    });
  }

  async #send(runId: string, reason: CallbackReason): Promise<void> {
    const { runs, credentials, logger } = this.#deps;
    const state = this.#state(runId);
    Object.assign(state, { status: 'sending', reason, attempts: 0, error: null, dirty: false });

    try {
      const creds = credentials.get();
      if (!creds) {
        this.#markFailed(state, runId, 'not_registered');
        return;
      }

      const complete = runs.isComplete(runId);
      const payload: CallbackPayload = { cid: creds.cid, run_id: runId, result: buildResult(runs.items(runId)) };
      const response = await this.#postWithRetry(payload, creds, state);

      Object.assign(state, { status: 'sent', sentAt: new Date().toISOString(), response, everSent: true });
      state.sentComplete ||= complete;
      logger.info(
        {
          runId,
          reason,
          complete,
          items: payload.result.length,
          withoutPrice: payload.result.filter((item) => item.price === null).length,
          attempts: state.attempts,
          response,
        },
        'callback sent',
      );
    } catch (err) {
      this.#markFailed(state, runId, err instanceof PlatformError ? err.kind : 'internal', err);
    } finally {
      if (state.dirty) {
        state.dirty = false;
        this.#evaluate(runId);
      }
    }
  }

  async #postWithRetry(payload: CallbackPayload, creds: Credentials, state: CallbackState): Promise<unknown> {
    const { platform, retryPolicy, sleep, logger } = this.#deps;
    const retry: RetryState = { attempts: 0, rateLimitHits: 0 };

    for (;;) {
      state.attempts += 1;
      try {
        return await platform.sendCallback(payload, creds);
      } catch (err) {
        if (err instanceof PlatformError && err.kind === 'rate_limited') {
          retry.rateLimitHits += 1;
        } else {
          retry.attempts += 1;
          retry.rateLimitHits = 0;
        }

        const delay = retryPolicy(err, retry);
        if (delay === null) throw err;
        logger.warn({ runId: payload.run_id, kind: (err as PlatformError).kind, delay }, 'retrying callback');
        await sleep(delay);
      }
    }
  }

  #markFailed(state: CallbackState, runId: string, error: string, err?: unknown): void {
    Object.assign(state, { status: 'failed', error });
    this.#deps.logger.error({ runId, error, err: error === 'internal' ? err : undefined }, 'callback failed');
  }

  #armIdleTimer(runId: string): void {
    const existing = this.#timers.get(runId);
    if (existing) {
      existing.refresh();
      return;
    }
    const timer = setTimeout(() => this.#onIdle(runId), this.#deps.idleTimeoutMs).unref();
    this.#timers.set(runId, timer);
  }

  #clearTimer(runId: string): void {
    clearTimeout(this.#timers.get(runId));
    this.#timers.delete(runId);
  }

  #state(runId: string): CallbackState {
    let state = this.#states.get(runId);
    if (!state) {
      state = {
        status: 'idle',
        reason: null,
        attempts: 0,
        error: null,
        sentAt: null,
        response: null,
        everSent: false,
        sentComplete: false,
        scheduled: false,
        dirty: false,
      };
      this.#states.set(runId, state);
    }
    return state;
  }
}

function toView({ status, reason, attempts, error, sentAt, response }: CallbackState): CallbackView {
  return { status, reason, attempts, error, sentAt, response };
}
