import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { RunFinalizer } from '../../src/callback/run-finalizer.ts';
import { PlatformError, type PlatformErrorKind } from '../../src/platform/errors.ts';
import type { CallbackPayload, Credentials } from '../../src/platform/types.ts';
import { createRetryPolicy } from '../../src/resilience/retry-policy.ts';
import { RunStore } from '../../src/runs/run-store.ts';
import { fakeClock, fakeCredentials, silentLogger, unusedPlatform } from '../helpers.ts';

const IDLE_MS = 30;

type Behavior = (call: number) => unknown;

function setup(behavior: Behavior = () => ({ ok: true }), { credentials = { cid: 'c1', token: 't1' } as Credentials | null } = {}) {
  const runs = new RunStore();
  const sent: CallbackPayload[] = [];
  const platform = {
    ...unusedPlatform,
    async sendCallback(payload: CallbackPayload) {
      sent.push(structuredClone(payload));
      const result = await behavior(sent.length);
      if (result instanceof Error) throw result;
      return result;
    },
  };

  const finalizer = new RunFinalizer({
    runs,
    platform,
    credentials: fakeCredentials(credentials),
    retryPolicy: createRetryPolicy({ maxAttempts: 5, random: () => 0.5 }),
    logger: silentLogger,
    idleTimeoutMs: IDLE_MS,
    sleep: fakeClock().sleep,
  });
  finalizer.start();

  const settle = (seq: number, outcome: 'done' | 'failed' = 'done', runId = 'r1') => {
    runs.recordMessage({ runId, seq, sku: `sku-${seq}` });
    if (outcome === 'done') runs.markDone(runId, seq, { price: seq * 10, stock: seq });
    else runs.markFailed(runId, seq, 'not_found');
  };

  return { runs, sent, finalizer, settle };
}

async function waitFor(condition: () => boolean, timeoutMs = 1_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condição não atingida a tempo');
    await delay(2);
  }
}

const fail = (kind: PlatformErrorKind) => new PlatformError({ kind });

test('run completo envia um único callback com todos os itens', async (t) => {
  const { runs, sent, finalizer, settle } = setup();
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 20, startedAt: 'x' });
  for (let seq = 19; seq >= 0; seq--) settle(seq);

  await waitFor(() => finalizer.callback('r1')?.status === 'sent');
  await delay(IDLE_MS * 2);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.cid, 'c1');
  assert.equal(sent[0]!.run_id, 'r1');
  assert.deepEqual(sent[0]!.result.map((item) => item.seq), [...Array(20).keys()]);
  assert.equal(finalizer.callback('r1')?.reason, 'complete');
});

test('item failed entra com price e stock null', async (t) => {
  const { runs, sent, finalizer, settle } = setup();
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 2, startedAt: 'x' });
  settle(0);
  settle(1, 'failed');

  await waitFor(() => sent.length === 1);
  assert.deepEqual(sent[0]!.result, [
    { seq: 0, sku: 'sku-0', price: 0, stock: 0 },
    { seq: 1, sku: 'sku-1', price: null, stock: null },
  ]);
});

test('mensagem que nunca chega gera callback parcial após o timeout', async (t) => {
  const { runs, sent, finalizer, settle } = setup();
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 3, startedAt: 'x' });
  settle(0);
  settle(2);

  await waitFor(() => sent.length === 1);
  assert.deepEqual(sent[0]!.result.map((item) => item.seq), [0, 2]);
  assert.equal(finalizer.callback('r1')?.reason, 'idle_timeout');
});

test('timeout não dispara enquanto há item em processamento', async (t) => {
  const { runs, sent, finalizer, settle } = setup();
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 2, startedAt: 'x' });
  settle(0);
  runs.recordMessage({ runId: 'r1', seq: 1, sku: 'sku-1' });

  await delay(IDLE_MS * 4);
  assert.equal(sent.length, 0);

  runs.markDone('r1', 1, { price: 1, stock: 1 });
  await waitFor(() => sent.length === 1);
  assert.equal(finalizer.callback('r1')?.reason, 'complete');
});

test('mensagem atrasada após o parcial gera novo callback completo', async (t) => {
  const { runs, sent, finalizer, settle } = setup();
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 2, startedAt: 'x' });
  settle(0);
  await waitFor(() => sent.length === 1);

  settle(1);

  await waitFor(() => sent.length === 2);
  assert.equal(sent[1]!.result.length, 2);
  assert.equal(finalizer.callback('r1')?.reason, 'complete');
});

test('run completado durante o envio do parcial é reenviado ao final', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { runs, sent, finalizer, settle } = setup(async (call) => {
    if (call === 1) await gate;
    return { ok: true };
  });
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 2, startedAt: 'x' });
  settle(0);
  await waitFor(() => finalizer.callback('r1')?.status === 'sending');

  settle(1);
  assert.equal(sent.length, 1);
  release();

  await waitFor(() => sent.length === 2);
  assert.equal(sent[1]!.result.length, 2);
});

test('duplicata depois do callback completo não reenvia', async (t) => {
  const { runs, sent, finalizer, settle } = setup();
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  settle(0);
  await waitFor(() => sent.length === 1);

  runs.recordMessage({ runId: 'r1', seq: 0, sku: 'sku-0' });
  await delay(IDLE_MS * 2);

  assert.equal(sent.length, 1);
});

test('500 seguido de 200 fica sent após 2 tentativas', async (t) => {
  const { runs, finalizer, settle } = setup((call) => (call === 1 ? fail('server') : { ok: true }));
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  settle(0);

  await waitFor(() => finalizer.callback('r1')?.status === 'sent');
  assert.equal(finalizer.callback('r1')?.attempts, 2);
});

test('401 fica failed sem retry', async (t) => {
  const { runs, sent, finalizer, settle } = setup(() => fail('unauthorized'));
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  settle(0);

  await waitFor(() => finalizer.callback('r1')?.status === 'failed');
  assert.equal(sent.length, 1);
  assert.equal(finalizer.callback('r1')?.error, 'unauthorized');
});

test('sem credenciais o callback falha com not_registered', async (t) => {
  const { runs, sent, finalizer, settle } = setup(undefined, { credentials: null });
  t.after(() => finalizer.stop());

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  settle(0);

  await waitFor(() => finalizer.callback('r1')?.status === 'failed');
  assert.equal(sent.length, 0);
  assert.equal(finalizer.callback('r1')?.error, 'not_registered');
});

test('reenvio manual: run inexistente, em andamento e sucesso', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { runs, sent, finalizer, settle } = setup(async (call) => {
    if (call === 1) await gate;
    return { report: call };
  });
  t.after(() => finalizer.stop());

  assert.deepEqual(await finalizer.resend('nada'), { outcome: 'run_not_found' });

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  settle(0);
  await waitFor(() => finalizer.callback('r1')?.status === 'sending');
  assert.deepEqual(await finalizer.resend('r1'), { outcome: 'in_progress' });

  release();
  await waitFor(() => finalizer.callback('r1')?.status === 'sent');

  const manual = await finalizer.resend('r1');
  assert.equal(manual.outcome, 'sent');
  assert.equal(sent.length, 2);
  assert.deepEqual(finalizer.callback('r1')?.response, { report: 2 });
  assert.equal(finalizer.callback('r1')?.reason, 'manual');
});
