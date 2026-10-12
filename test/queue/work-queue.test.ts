import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTick } from 'node:timers/promises';
import { WorkQueue } from '../../src/queue/work-queue.ts';

test('entrega em ordem FIFO', () => {
  const queue = new WorkQueue<number>();
  [1, 2, 3].forEach((n) => queue.enqueue(n));

  assert.equal(queue.size, 3);
  assert.deepEqual([queue.dequeue(), queue.dequeue(), queue.dequeue(), queue.dequeue()], [1, 2, 3, undefined]);
  assert.equal(queue.size, 0);
});

test('aviso é assíncrono e único por rajada', async () => {
  const queue = new WorkQueue<number>();
  let notified = 0;
  queue.onAvailable(() => notified++);

  queue.enqueue(1);
  queue.enqueue(2);
  queue.enqueue(3);
  assert.equal(notified, 0);

  await nextTick();
  assert.equal(notified, 1);

  queue.enqueue(4);
  await nextTick();
  assert.equal(notified, 2);
});

test('listener removido não é mais avisado', async () => {
  const queue = new WorkQueue<number>();
  let notified = 0;
  const unsubscribe = queue.onAvailable(() => notified++);
  unsubscribe();

  queue.enqueue(1);
  await nextTick();
  assert.equal(notified, 0);
});
