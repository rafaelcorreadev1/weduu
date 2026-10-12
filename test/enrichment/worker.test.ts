import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ConcurrencyLimiter } from '../../src/enrichment/limiter.ts';
import { createRetryPolicy } from '../../src/resilience/retry-policy.ts';
import { EnrichmentWorker } from '../../src/enrichment/worker.ts';
import { PlatformError, type PlatformErrorKind } from '../../src/platform/errors.ts';
import type { Credentials, EnrichResponse } from '../../src/platform/types.ts';
import { WorkQueue } from '../../src/queue/work-queue.ts';
import { RunStore } from '../../src/runs/run-store.ts';
import type { WorkItem } from '../../src/runs/types.ts';
import { fakeClock, fakeCredentials, silentLogger, unusedPlatform } from '../helpers.ts';

type Behavior = (sku: string, call: number) => EnrichResponse | Error;

const ok = (sku: string): EnrichResponse => ({ sku, price: 10, stock: 1 });
const fail = (kind: PlatformErrorKind, retryAfterMs: number | null = null) => new PlatformError({ kind, retryAfterMs });

function setup(behavior: Behavior, { credentials = { cid: 'c1', token: 't1' } as Credentials | null } = {}) {
  const clock = fakeClock();
  const queue = new WorkQueue<WorkItem>();
  const runs = new RunStore();
  const calls: { sku: string; at: number }[] = [];
  let inFlight = 0;
  let peak = 0;

  const platform = {
    ...unusedPlatform,
    async enrich(sku: string) {
      calls.push({ sku, at: clock.now });
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        await delay(1);
        const result = behavior(sku, calls.length);
        if (result instanceof Error) throw result;
        return result;
      } finally {
        inFlight -= 1;
      }
    },
  };

  const worker = new EnrichmentWorker({
    queue,
    runs,
    platform,
    credentials: fakeCredentials(credentials),
    limiter: new ConcurrencyLimiter({ maxConcurrency: 3, sleep: clock.sleep, now: clock.nowFn }),
    retryPolicy: createRetryPolicy({ maxAttempts: 5, random: () => 0.5 }),
    logger: silentLogger,
    maxActiveItems: 12,
    sleep: clock.sleep,
  });

  async function process(items: WorkItem[]) {
    for (const item of items) {
      runs.recordMessage(item);
      queue.enqueue(item);
    }
    worker.start();
    await worker.idle();
    return runs.get(items[0]!.runId)!;
  }

  return { process, calls, clock, peak: () => peak };
}

const items = (count: number, sku = (seq: number) => `sku-${seq}`): WorkItem[] =>
  Array.from({ length: count }, (_, seq) => ({ runId: 'r1', seq, sku: sku(seq) }));

test('20 itens são processados sem passar de 3 chamadas em voo', async () => {
  const { process, calls, peak } = setup(ok);

  const run = await process(items(20));

  assert.equal(run.done, 20);
  assert.equal(run.pending, 0);
  assert.equal(calls.length, 20);
  assert.equal(peak(), 3);
});

test('500 seguido de 200 termina done após 2 chamadas', async () => {
  const { process, calls } = setup((sku, call) => (call === 1 ? fail('server') : ok(sku)));

  const run = await process(items(1));

  assert.equal(run.done, 1);
  assert.equal(calls.length, 2);
  assert.equal(run.enrichCalls, 2);
});

test('500 persistente faz 5 tentativas e marca failed com motivo server', async () => {
  const { process, calls } = setup(() => fail('server'));

  const run = await process(items(1));

  assert.equal(run.failed, 1);
  assert.equal(calls.length, 5);
});

test('429 espera o retry-after antes de repetir e não consome tentativas', async () => {
  const { process, calls } = setup((sku, call) => (call <= 6 ? fail('rate_limited', 1_000) : ok(sku)));

  const run = await process(items(1));

  assert.equal(run.done, 1);
  assert.equal(calls.length, 7);
  for (let i = 1; i < calls.length; i++) {
    assert.ok(calls[i]!.at - calls[i - 1]!.at >= 1_000, `chamada ${i} veio cedo demais`);
  }
});

for (const kind of ['not_found', 'unauthorized', 'invalid_response'] as const) {
  test(`${kind} é definitivo: 1 chamada e item failed`, async () => {
    const { process, calls } = setup(() => fail(kind));

    const run = await process(items(1));

    assert.equal(run.failed, 1);
    assert.equal(calls.length, 1);
  });
}

test('sem credenciais o item falha sem chamar a plataforma', async () => {
  const { process, calls } = setup(ok, { credentials: null });

  const run = await process(items(2));

  assert.equal(run.failed, 2);
  assert.equal(calls.length, 0);
});

test('mesmo sku em seq diferentes gera uma única chamada', async () => {
  const { process, calls } = setup(ok);

  const run = await process(items(4, () => 'sku-igual'));

  assert.equal(run.done, 4);
  assert.equal(calls.length, 1);
});

test('404 fica em cache para o mesmo sku', async () => {
  const { process, calls } = setup(() => fail('not_found'));

  const run = await process(items(3, () => 'sku-invalido'));

  assert.equal(run.failed, 3);
  assert.equal(calls.length, 1);
});

test('erro inesperado marca internal e o worker segue processando', async () => {
  const { process } = setup((sku) => (sku === 'sku-0' ? new TypeError('bug') : ok(sku)));

  const run = await process(items(5));

  assert.equal(run.failed, 1);
  assert.equal(run.done, 4);
});
