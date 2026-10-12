import type { CallbackItem } from '../platform/types.ts';
import type { ItemResult } from '../runs/types.ts';

export function buildResult(items: readonly ItemResult[]): CallbackItem[] {
  return [...items]
    .sort((a, b) => a.seq - b.seq)
    .map((item) => {
      const enrichment = item.status === 'done' ? item.enrichment : null;
      return {
        seq: item.seq,
        sku: item.sku,
        price: enrichment?.price ?? null,
        stock: enrichment?.stock ?? null,
      };
    });
}
