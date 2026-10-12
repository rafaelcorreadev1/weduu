import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunStore } from '../../src/runs/run-store.ts';

const msg = (seq: number, sku = `sku-${seq}`, runId = 'r1') => ({ runId, seq, sku });

test('primeira mensagem é aceita e a repetição é duplicata', () => {
  const runs = new RunStore();

  assert.deepEqual(runs.recordMessage(msg(7)), { outcome: 'accepted' });
  assert.deepEqual(runs.recordMessage(msg(7)), { outcome: 'duplicate', knownSku: 'sku-7' });

  assert.equal(runs.get('r1')?.received, 1);
  assert.equal(runs.get('r1')?.duplicates, 1);
});

test('mesmo seq em runs diferentes não é duplicata', () => {
  const runs = new RunStore();

  assert.equal(runs.recordMessage(msg(0, 'a', 'r1')).outcome, 'accepted');
  assert.equal(runs.recordMessage(msg(0, 'b', 'r2')).outcome, 'accepted');
});

test('duplicata com sku diferente mantém o primeiro sku', () => {
  const runs = new RunStore();
  runs.recordMessage(msg(3, 'original'));

  assert.deepEqual(runs.recordMessage(msg(3, 'outro')), { outcome: 'duplicate', knownSku: 'original' });
});

test('mensagem antes do burst cria o run e o burst preenche o total depois', () => {
  const runs = new RunStore();
  runs.recordMessage(msg(5, 'sku-5', 'r9'));

  assert.equal(runs.get('r9')?.total, null);

  runs.startRun({ runId: 'r9', total: 20, startedAt: '2026-08-03T12:00:00Z' });

  assert.deepEqual(runs.get('r9'), {
    runId: 'r9',
    total: 20,
    startedAt: '2026-08-03T12:00:00Z',
    received: 1,
    duplicates: 0,
    pending: 1,
    done: 0,
    failed: 0,
    enrichCalls: 0,
  });
});

test('markDone e markFailed tiram o item de pending', () => {
  const runs = new RunStore();
  [0, 1, 2].forEach((seq) => runs.recordMessage(msg(seq)));

  runs.markDone('r1', 0, { price: 149.9, stock: 42 });
  runs.markFailed('r1', 1, 'not_found');
  runs.recordEnrichCall('r1');

  assert.deepEqual(
    { ...runs.get('r1') },
    { runId: 'r1', total: null, startedAt: null, received: 3, duplicates: 0, pending: 1, done: 1, failed: 1, enrichCalls: 1 },
  );
});

test('isComplete exige total conhecido, nenhum pending e todos os seq', () => {
  const runs = new RunStore();
  runs.startRun({ runId: 'r1', total: 3, startedAt: 'x' });
  [0, 1, 2].forEach((seq) => runs.recordMessage(msg(seq)));
  runs.markDone('r1', 0, { price: 1, stock: 1 });
  runs.markFailed('r1', 1, 'not_found');

  assert.equal(runs.isComplete('r1'), false);

  runs.markDone('r1', 2, { price: 1, stock: 1 });
  assert.equal(runs.isComplete('r1'), true);
});

test('run com seq fora do intervalo não completa enquanto falta seq esperado', () => {
  const runs = new RunStore();
  runs.startRun({ runId: 'r1', total: 2, startedAt: 'x' });
  [0, 5].forEach((seq) => {
    runs.recordMessage(msg(seq));
    runs.markDone('r1', seq, { price: 1, stock: 1 });
  });

  assert.equal(runs.isComplete('r1'), false);
  assert.deepEqual(runs.missingSeqs('r1'), [1]);
});

test('burst registrado depois das mensagens completa o run', () => {
  const runs = new RunStore();
  runs.recordMessage(msg(0));
  runs.markDone('r1', 0, { price: 1, stock: 1 });
  assert.equal(runs.isComplete('r1'), false);

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  assert.equal(runs.isComplete('r1'), true);
});

test('onChange avisa mudanças, mas não duplicatas', () => {
  const runs = new RunStore();
  const changes: string[] = [];
  runs.onChange((runId) => changes.push(runId));

  runs.startRun({ runId: 'r1', total: 1, startedAt: 'x' });
  runs.recordMessage(msg(0));
  runs.recordMessage(msg(0));
  runs.markDone('r1', 0, { price: 1, stock: 1 });

  assert.equal(changes.length, 3);
});

test('items devolve o estado de cada seq', () => {
  const runs = new RunStore();
  runs.recordMessage(msg(1));
  runs.markDone('r1', 1, { price: 2, stock: 3 });

  assert.deepEqual(runs.items('r1'), [{ seq: 1, sku: 'sku-1', status: 'done', enrichment: { price: 2, stock: 3 } }]);
  assert.deepEqual(runs.items('nada'), []);
});

test('markDone de item ou run desconhecido é ignorado', () => {
  const runs = new RunStore();
  runs.markDone('nada', 0, { price: 1, stock: 1 });
  runs.recordMessage(msg(0));
  runs.markDone('r1', 99, { price: 1, stock: 1 });

  assert.equal(runs.get('nada'), undefined);
  assert.equal(runs.get('r1')?.done, 0);
});

test('run desconhecido devolve undefined', () => {
  assert.equal(new RunStore().get('nada'), undefined);
});
