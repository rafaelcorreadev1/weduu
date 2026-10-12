import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResult } from '../../src/callback/consolidate.ts';
import type { ItemResult } from '../../src/runs/types.ts';

test('ordena por seq e usa null para itens failed', () => {
  const items: ItemResult[] = [
    { seq: 5, sku: 'sku-5', status: 'done', enrichment: { price: 149.9, stock: 42 } },
    { seq: 0, sku: 'sku-0', status: 'done', enrichment: { price: 10, stock: 0 } },
    { seq: 3, sku: 'sku-3', status: 'failed', reason: 'not_found' },
  ];

  assert.deepEqual(buildResult(items), [
    { seq: 0, sku: 'sku-0', price: 10, stock: 0 },
    { seq: 3, sku: 'sku-3', price: null, stock: null },
    { seq: 5, sku: 'sku-5', price: 149.9, stock: 42 },
  ]);
});

test('não altera a lista recebida', () => {
  const items: ItemResult[] = [
    { seq: 1, sku: 'b', status: 'pending' },
    { seq: 0, sku: 'a', status: 'pending' },
  ];

  buildResult(items);

  assert.deepEqual(items.map((item) => item.seq), [1, 0]);
});
