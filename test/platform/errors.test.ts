import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlatformError, kindFromStatus, parseRetryAfter, type PlatformErrorKind } from '../../src/platform/errors.ts';

test('classifica status HTTP', () => {
  assert.equal(kindFromStatus(401), 'unauthorized');
  assert.equal(kindFromStatus(404), 'not_found');
  assert.equal(kindFromStatus(422), 'handshake_failed');
  assert.equal(kindFromStatus(429), 'rate_limited');
  assert.equal(kindFromStatus(500), 'server');
  assert.equal(kindFromStatus(503), 'server');
  assert.equal(kindFromStatus(400), 'client');
});

test('retryable só para falhas transitórias', () => {
  const retryable: PlatformErrorKind[] = ['rate_limited', 'server', 'network', 'timeout'];
  const definitive: PlatformErrorKind[] = ['unauthorized', 'not_found', 'handshake_failed', 'client', 'invalid_response'];

  for (const kind of retryable) assert.equal(new PlatformError({ kind }).retryable, true, kind);
  for (const kind of definitive) assert.equal(new PlatformError({ kind }).retryable, false, kind);
});

test('retry-after em segundos', () => {
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter('0.5'), 500);
});

test('retry-after em data HTTP', () => {
  const now = Date.parse('2026-08-03T12:00:00Z');
  assert.equal(parseRetryAfter('Mon, 03 Aug 2026 12:00:03 GMT', now), 3000);
  assert.equal(parseRetryAfter('Mon, 03 Aug 2026 11:59:00 GMT', now), 0);
});

test('retry-after ausente ou inválido', () => {
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(''), null);
  assert.equal(parseRetryAfter('amanhã'), null);
});
