import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { buildTestApp } from '../helpers.ts';

const message = (seq: number, runId = 'r1') => ({ run_id: runId, seq, sku: `sku-${seq}` });

test('mensagem válida responde 200 e vai para a fila', async () => {
  const { app, queue } = buildTestApp();

  const res = await request(app).post('/process').send(message(7));

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(queue.dequeue(), { runId: 'r1', seq: 7, sku: 'sku-7' });
});

const invalidBodies = [
  { run_id: 'r1', seq: -1, sku: 'sku' },
  { run_id: 'r1', seq: '7', sku: 'sku' },
  { run_id: 'r1', seq: 7.5, sku: 'sku' },
  { seq: 1, sku: 'sku' },
  { run_id: 'r1', seq: 1 },
  { run_id: '', seq: 1, sku: 'sku' },
];

for (const body of invalidBodies) {
  test(`mensagem inválida responde 400: ${JSON.stringify(body)}`, async () => {
    const { app, queue, runs } = buildTestApp();

    const res = await request(app).post('/process').send(body);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'invalid_message' });
    assert.equal(queue.size, 0);
    assert.equal(runs.get('r1'), undefined);
  });
}

test('duplicata responde 200 mas é enfileirada uma vez só', async () => {
  const { app, queue, runs } = buildTestApp();

  const first = await request(app).post('/process').send(message(7));
  const second = await request(app).post('/process').send(message(7));

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(queue.size, 1);
  assert.equal(runs.get('r1')?.duplicates, 1);
});

test('mesmo seq em runs diferentes é aceito nos dois', async () => {
  const { app, queue } = buildTestApp();

  await request(app).post('/process').send(message(0, 'r1'));
  await request(app).post('/process').send(message(0, 'r2'));

  assert.equal(queue.size, 2);
});

test('mensagens fora de ordem são todas aceitas', async () => {
  const { app, queue } = buildTestApp();

  for (const seq of [5, 0, 3]) await request(app).post('/process').send(message(seq));

  assert.deepEqual(
    [queue.dequeue(), queue.dequeue(), queue.dequeue()].map((item) => item?.seq),
    [5, 0, 3],
  );
});

test('consumidor que nunca termina não atrasa o ACK', async () => {
  const { app, queue } = buildTestApp();
  queue.onAvailable(() => {
    void new Promise(() => {});
  });

  const res = await request(app).post('/process').send(message(1));

  assert.equal(res.status, 200);
});

// Folga para os arquivos de teste rodando em paralelo; esperar o /enrich custaria no mínimo 400ms.
test('rajada de 20 mensagens concorrentes: todas 200 e cada uma abaixo de 150ms', async () => {
  const { app, queue } = buildTestApp();
  const server = app.listen(0);
  await request(server).post('/process').send(message(999, 'warmup'));

  try {
    const timings = await Promise.all(
      Array.from({ length: 20 }, async (_, seq) => {
        const start = performance.now();
        const res = await request(server).post('/process').send(message(seq));
        return { status: res.status, ms: performance.now() - start };
      }),
    );

    assert.ok(timings.every((t) => t.status === 200));
    const slowest = Math.max(...timings.map((t) => t.ms));
    assert.ok(slowest < 150,`resposta mais lenta: ${slowest.toFixed(1)}ms`);
    assert.equal(queue.size, 21);
  } finally {
    server.close();
  }
});
