import type { Express } from 'express';
import { createApp, type AppDeps } from '../src/app.ts';
import type { CallbackService } from '../src/callback/run-finalizer.ts';
import { loadConfig } from '../src/config.ts';
import { createLogger } from '../src/logger.ts';
import type { CredentialProvider, Credentials, PlatformClient } from '../src/platform/types.ts';
import { WorkQueue } from '../src/queue/work-queue.ts';
import { RunStore } from '../src/runs/run-store.ts';
import type { RunStarted, WorkItem } from '../src/runs/types.ts';

export const silentLogger = createLogger({ level: 'silent' });
export const ADMIN_KEY = 'test-admin-key';

export interface FakeCredentials extends CredentialProvider {
  saved: Credentials[];
}

export function fakeCredentials(initial: Credentials | null = null): FakeCredentials {
  let current = initial;
  const saved: Credentials[] = [];
  return {
    saved,
    get: () => current,
    async save(creds) {
      saved.push(creds);
      current = creds;
    },
  };
}

export const unusedPlatform: PlatformClient = {
  register: () => Promise.reject(new Error('platform.register não configurado no teste')),
  requestBurst: () => Promise.reject(new Error('platform.requestBurst não configurado no teste')),
  enrich: () => Promise.reject(new Error('platform.enrich não configurado no teste')),
  sendCallback: () => Promise.reject(new Error('platform.sendCallback não configurado no teste')),
};

const unusedCallbacks: CallbackService = {
  callback: () => undefined,
  resend: () => Promise.reject(new Error('callbacks.resend não configurado no teste')),
};

export function fakeClock(start = 1_000_000) {
  const clock = {
    now: start,
    sleeps: [] as number[],
    nowFn: () => clock.now,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.now += ms;
    },
  };
  return clock;
}

interface TestApp {
  app: Express;
  startedRuns: RunStarted[];
  runs: RunStore;
  queue: WorkQueue<WorkItem>;
}

export function buildTestApp(overrides: Partial<AppDeps> = {}): TestApp {
  const startedRuns: RunStarted[] = [];
  const runs = overrides.runs ?? new RunStore();
  const queue = overrides.queue ?? new WorkQueue<WorkItem>();
  const app = createApp({
    logger: silentLogger,
    config: loadConfig({ ADMIN_KEY, PUBLIC_URL: 'https://public.example' }),
    platform: unusedPlatform,
    credentials: fakeCredentials(),
    callbacks: unusedCallbacks,
    onRunStarted: (run) => startedRuns.push(run),
    ...overrides,
    runs,
    queue,
  });
  return { app, startedRuns, runs, queue };
}

export function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
