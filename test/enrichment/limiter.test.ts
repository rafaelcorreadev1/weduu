import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ConcurrencyLimiter } from '../../src/enrichment/limiter.ts';
import { fakeClock } from '../helpers.ts';

test('nunca passa do limite de tarefas simultâneas', async () => {
  const limiter = new ConcurrencyLimiter({ maxConcurrency: 3 });
  let current = 0;
  let peak = 0;

  await Promise.all(
    Array.from({ length: 20 }, () =>
      limiter.run(async () => {
        current += 1;
        peak = Math.max(peak, current);
        await delay(2);
        current -= 1;
      }),
    ),
  );

  assert.equal(peak, 3);
  assert.equal(limiter.inFlight, 0);
});

test('libera a vaga quando a tarefa falha', async () => {
  const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });

  await assert.rejects(limiter.run(() => Promise.reject(new Error('boom'))));
  assert.equal(await limiter.run(async () => 'ok'), 'ok');
});

test('pauseFor segura novos acquires até o fim da pausa', async () => {
  const clock = fakeClock();
  const limiter = new ConcurrencyLimiter({ maxConcurrency: 3, sleep: clock.sleep, now: clock.nowFn });
  const pausedAt = clock.now;

  limiter.pauseFor(1_000);
  const startedAt = await limiter.run(async () => clock.now);

  assert.ok(startedAt >= pausedAt + 1_000);
});

test('pausa menor não encurta uma pausa maior já ativa', async () => {
  const clock = fakeClock();
  const limiter = new ConcurrencyLimiter({ maxConcurrency: 3, sleep: clock.sleep, now: clock.nowFn });
  const pausedAt = clock.now;

  limiter.pauseFor(2_000);
  limiter.pauseFor(500);
  const startedAt = await limiter.run(async () => clock.now);

  assert.ok(startedAt >= pausedAt + 2_000);
});
