export type PlatformErrorKind =
  | 'unauthorized'
  | 'not_found'
  | 'handshake_failed'
  | 'rate_limited'
  | 'server'
  | 'client'
  | 'network'
  | 'timeout'
  | 'invalid_response';

const RETRYABLE_KINDS: ReadonlySet<PlatformErrorKind> = new Set(['rate_limited', 'server', 'network', 'timeout']);

interface PlatformErrorInit {
  kind: PlatformErrorKind;
  status?: number | null;
  body?: unknown;
  retryAfterMs?: number | null;
  cause?: unknown;
}

export class PlatformError extends Error {
  readonly kind: PlatformErrorKind;
  readonly status: number | null;
  readonly body: unknown;
  readonly retryAfterMs: number | null;

  constructor({ kind, status = null, body = null, retryAfterMs = null, cause }: PlatformErrorInit) {
    super(status ? `platform responded ${status} (${kind})` : `platform request failed (${kind})`, { cause });
    this.name = 'PlatformError';
    this.kind = kind;
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }

  get retryable(): boolean {
    return RETRYABLE_KINDS.has(this.kind);
  }
}

export function kindFromStatus(status: number): PlatformErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 422) return 'handshake_failed';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'client';
}

export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (value == null || value === '') return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}
