import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetryPolicy } from '../../src/resilience/retry-policy.ts';
import { PlatformError, type PlatformErrorKind } from '../../src/platform/errors.ts';

const error = (kind: PlatformErrorKind, retryAfterMs: number | null = null) => new PlatformError({ kind, retryAfterMs });

test('backoff exponencial com equal jitter', () => {
  const min = createRetryPolicy({ maxAttempts: 10, random: () => 0 });
  const max = createRetryPolicy({ maxAttempts: 10, random: () => 1 });

  assert.deepEqual(
    [1, 2, 3, 4].map((attempts) => min(error('server'), { attempts, rateLimitHits: 0 })),
    [100, 200, 400, 800],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map((attempts) => max(error('server'), { attempts, rateLimitHits: 0 })),
    [200, 400, 800, 1600],
  );
});

test('backoff respeita o teto de 3000ms', () => {
  const policy = createRetryPolicy({ maxAttempts: 20, random: () => 1 });
  assert.equal(policy(error('timeout'), { attempts: 10, rateLimitHits: 0 }), 3000);
});

test('desiste ao atingir maxAttempts', () => {
  const policy = createRetryPolicy({ maxAttempts: 5 });
  assert.notEqual(policy(error('network'), { attempts: 4, rateLimitHits: 0 }), null);
  assert.equal(policy(error('network'), { attempts: 5, rateLimitHits: 0 }), null);
});

test('429 usa o retry-after e ignora maxAttempts', () => {
  const policy = createRetryPolicy({ maxAttempts: 1 });
  assert.equal(policy(error('rate_limited', 2500), { attempts: 1, rateLimitHits: 1 }), 2500);
});

test('429 sem retry-after espera 1s', () => {
  const policy = createRetryPolicy({ maxAttempts: 5 });
  assert.equal(policy(error('rate_limited'), { attempts: 0, rateLimitHits: 1 }), 1000);
});

test('429 desiste após o limite de respostas seguidas', () => {
  const policy = createRetryPolicy({ maxAttempts: 5, maxRateLimitRetries: 20 });
  assert.notEqual(policy(error('rate_limited'), { attempts: 0, rateLimitHits: 19 }), null);
  assert.equal(policy(error('rate_limited'), { attempts: 0, rateLimitHits: 20 }), null);
});

test('erros definitivos e desconhecidos não são repetidos', () => {
  const policy = createRetryPolicy({ maxAttempts: 5 });
  for (const kind of ['unauthorized', 'not_found', 'invalid_response', 'client'] as const) {
    assert.equal(policy(error(kind), { attempts: 1, rateLimitHits: 0 }), null, kind);
  }
  assert.equal(policy(new Error('bug'), { attempts: 1, rateLimitHits: 0 }), null);
});
