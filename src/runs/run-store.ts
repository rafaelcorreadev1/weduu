import type { Enrichment, ItemResult, ItemState, RecordOutcome, RunSnapshot, RunStarted, WorkItem } from './types.ts';

type ChangeListener = (runId: string) => void;

interface Run {
  runId: string;
  total: number | null;
  startedAt: string | null;
  items: Map<number, ItemState>;
  counts: Record<ItemState['status'], number>;
  duplicates: number;
  enrichCalls: number;
}

export class RunStore {
  readonly #runs = new Map<string, Run>();
  readonly #listeners = new Set<ChangeListener>();

  onChange(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  startRun({ runId, total, startedAt }: RunStarted): void {
    const run = this.#getOrCreate(runId);
    run.total = total;
    run.startedAt = startedAt;
    this.#notify(runId);
  }

  recordMessage({ runId, seq, sku }: WorkItem): RecordOutcome {
    const run = this.#getOrCreate(runId);
    const existing = run.items.get(seq);
    if (existing) {
      run.duplicates += 1;
      return { outcome: 'duplicate', knownSku: existing.sku };
    }

    run.items.set(seq, { sku, status: 'pending' });
    run.counts.pending += 1;
    this.#notify(runId);
    return { outcome: 'accepted' };
  }

  markDone(runId: string, seq: number, enrichment: Enrichment): void {
    this.#settle(runId, seq, (sku) => ({ sku, status: 'done', enrichment }));
  }

  markFailed(runId: string, seq: number, reason: string): void {
    this.#settle(runId, seq, (sku) => ({ sku, status: 'failed', reason }));
  }

  recordEnrichCall(runId: string): void {
    const run = this.#runs.get(runId);
    if (run) run.enrichCalls += 1;
  }

  get(runId: string): RunSnapshot | undefined {
    const run = this.#runs.get(runId);
    if (!run) return undefined;

    return {
      runId: run.runId,
      total: run.total,
      startedAt: run.startedAt,
      received: run.items.size,
      duplicates: run.duplicates,
      ...run.counts,
      enrichCalls: run.enrichCalls,
    };
  }

  isComplete(runId: string): boolean {
    const run = this.#runs.get(runId);
    if (!run || run.total === null || run.counts.pending > 0 || run.items.size < run.total) return false;
    return this.missingSeqs(runId).length === 0;
  }

  missingSeqs(runId: string): number[] {
    const run = this.#runs.get(runId);
    if (!run || run.total === null) return [];

    const missing: number[] = [];
    for (let seq = 0; seq < run.total; seq++) {
      if (!run.items.has(seq)) missing.push(seq);
    }
    return missing;
  }

  items(runId: string): ItemResult[] {
    const run = this.#runs.get(runId);
    return run ? [...run.items].map(([seq, item]) => ({ ...item, seq })) : [];
  }

  #settle(runId: string, seq: number, next: (sku: string) => ItemState): void {
    const run = this.#runs.get(runId);
    const item = run?.items.get(seq);
    if (!run || !item) return;

    const settled = next(item.sku);
    run.items.set(seq, settled);
    run.counts[item.status] -= 1;
    run.counts[settled.status] += 1;
    this.#notify(runId);
  }

  #notify(runId: string): void {
    for (const listener of this.#listeners) listener(runId);
  }

  #getOrCreate(runId: string): Run {
    let run = this.#runs.get(runId);
    if (!run) {
      run = {
        runId,
        total: null,
        startedAt: null,
        items: new Map(),
        counts: { pending: 0, done: 0, failed: 0 },
        duplicates: 0,
        enrichCalls: 0,
      };
      this.#runs.set(runId, run);
    }
    return run;
  }
}
