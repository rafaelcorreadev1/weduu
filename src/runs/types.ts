export interface RunStarted {
  runId: string;
  total: number;
  startedAt: string;
}

export type RunStartedHandler = (run: RunStarted) => void;

export interface WorkItem {
  runId: string;
  seq: number;
  sku: string;
}

export interface Enrichment {
  price: number;
  stock: number;
}

export type ItemState =
  | { sku: string; status: 'pending' }
  | { sku: string; status: 'done'; enrichment: Enrichment }
  | { sku: string; status: 'failed'; reason: string };

export type ItemResult = ItemState & { seq: number };

export type RecordOutcome = { outcome: 'accepted' } | { outcome: 'duplicate'; knownSku: string };

export interface RunSnapshot {
  runId: string;
  total: number | null;
  startedAt: string | null;
  received: number;
  duplicates: number;
  pending: number;
  done: number;
  failed: number;
  enrichCalls: number;
}
