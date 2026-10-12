import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformClient } from '../../src/platform/client.ts';
import { PlatformError } from '../../src/platform/errors.ts';
import { jsonResponse } from '../helpers.ts';

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function clientWith(handler: FetchHandler, timeoutMs = 1000) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  };
  return { client: createPlatformClient({ baseUrl: 'http://platform', timeoutMs, fetch }), calls };
}

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;
const CREDS = { cid: 'c1', token: 't1' };

test('enrich faz GET com x-cid e x-token e devolve price/stock', async () => {
  const { client, calls } = clientWith(() => jsonResponse(200, { sku: 'sku-001', price: 149.9, stock: 42 }));

  const result = await client.enrich('sku-001', CREDS);

  assert.deepEqual(result, { sku: 'sku-001', price: 149.9, stock: 42 });
  const call = calls[0]!;
  assert.equal(call.url, 'http://platform/enrich/sku-001');
  assert.equal(call.init.method, 'GET');
  assert.equal(headersOf(call.init)['x-cid'], 'c1');
  assert.equal(headersOf(call.init)['x-token'], 't1');
});

test('enrich codifica o sku na URL', async () => {
  const { client, calls } = clientWith(() => jsonResponse(200, { sku: 'a/b c', price: 1, stock: 1 }));

  await client.enrich('a/b c', CREDS);

  assert.equal(calls[0]!.url, 'http://platform/enrich/a%2Fb%20c');
});

test('enrich com 404 vira not_found e com 429 traz retry-after', async () => {
  const { client: notFound } = clientWith(() => jsonResponse(404, { error: 'not_found' }));
  const { client: limited } = clientWith(() => jsonResponse(429, {}, { 'retry-after': '2' }));

  await assert.rejects(notFound.enrich('x', CREDS), { kind: 'not_found' });
  await assert.rejects(limited.enrich('x', CREDS), { kind: 'rate_limited', retryAfterMs: 2000 });
});

test('enrich com price não numérico vira invalid_response', async () => {
  const { client } = clientWith(() => jsonResponse(200, { sku: 'x', price: '149.90', stock: 42 }));

  await assert.rejects(client.enrich('x', CREDS), { kind: 'invalid_response' });
});

test('sendCallback faz POST com o payload e x-token e devolve a resposta', async () => {
  const { client, calls } = clientWith(() => jsonResponse(200, { report_id: 'rep-1' }));
  const payload = { cid: 'c1', run_id: 'r1', result: [{ seq: 0, sku: 'sku-001', price: 149.9, stock: 42 }] };

  const response = await client.sendCallback(payload, CREDS);

  assert.deepEqual(response, { report_id: 'rep-1' });
  const call = calls[0]!;
  assert.equal(call.url, 'http://platform/callback');
  assert.equal(call.init.method, 'POST');
  assert.equal(headersOf(call.init)['x-token'], 't1');
  assert.deepEqual(JSON.parse(String(call.init.body)), payload);
});

test('sendCallback propaga 401 e 500 como PlatformError', async () => {
  const payload = { cid: 'c1', run_id: 'r1', result: [] };
  const { client: unauthorized } = clientWith(() => jsonResponse(401, { error: 'unauthorized' }));
  const { client: broken } = clientWith(() => jsonResponse(500, { error: 'boom' }));

  await assert.rejects(unauthorized.sendCallback(payload, CREDS), { kind: 'unauthorized' });
  await assert.rejects(broken.sendCallback(payload, CREDS), { kind: 'server' });
});

test('enrich usa o timeout próprio', async () => {
  const fetch = (_input: string | URL | Request, init: RequestInit = {}) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  const client = createPlatformClient({ baseUrl: 'http://platform', timeoutMs: 60_000, enrichTimeoutMs: 20, fetch });

  await assert.rejects(client.enrich('x', CREDS), { kind: 'timeout' });
});

test('register envia name e webhook e devolve cid/token', async () => {
  const { client, calls } = clientWith(() => jsonResponse(200, { cid: 'c1', token: 't1' }));

  const result = await client.register({ name: 'Fulano', webhook: 'https://x.ngrok.app' });

  assert.deepEqual(result, { cid: 'c1', token: 't1' });
  const call = calls[0]!;
  assert.equal(call.url, 'http://platform/register');
  assert.equal(call.init.method, 'POST');
  assert.equal(headersOf(call.init)['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(String(call.init.body)), { name: 'Fulano', webhook: 'https://x.ngrok.app' });
});

test('requestBurst usa o cid na URL e o token no header', async () => {
  const run = { run_id: 'r1', total: 20, started_at: '2026-08-03T12:00:00Z' };
  const { client, calls } = clientWith(() => jsonResponse(200, run));

  const result = await client.requestBurst({ cid: 'c1', token: 't1' });

  assert.deepEqual(result, run);
  const call = calls[0]!;
  assert.equal(call.url, 'http://platform/burst/c1');
  assert.equal(headersOf(call.init)['x-token'], 't1');
  assert.equal(call.init.body, null);
});

test('resposta 200 fora do contrato vira invalid_response', async () => {
  const { client } = clientWith(() => jsonResponse(200, { run_id: 'r1' }));

  await assert.rejects(client.requestBurst({ cid: 'c1', token: 't1' }), { kind: 'invalid_response' });
});

test('status de erro vira PlatformError com corpo e retry-after', async () => {
  const { client } = clientWith(() => jsonResponse(429, { error: 'too_many' }, { 'retry-after': '1' }));

  await assert.rejects(client.requestBurst({ cid: 'c1', token: 't1' }), (err) => {
    assert.ok(err instanceof PlatformError);
    assert.equal(err.kind, 'rate_limited');
    assert.equal(err.status, 429);
    assert.equal(err.retryAfterMs, 1000);
    assert.deepEqual(err.body, { error: 'too_many' });
    return true;
  });
});

test('422 do register vira handshake_failed com o motivo', async () => {
  const { client } = clientWith(() => jsonResponse(422, { error: 'handshake_failed', reason: 'timeout' }));

  await assert.rejects(client.register({ name: 'a', webhook: 'b' }), (err) => {
    assert.ok(err instanceof PlatformError);
    assert.equal(err.kind, 'handshake_failed');
    assert.deepEqual(err.body, { error: 'handshake_failed', reason: 'timeout' });
    return true;
  });
});

test('corpo não-JSON não quebra o cliente', async () => {
  const { client } = clientWith(() => new Response('Bad Gateway', { status: 502 }));

  await assert.rejects(client.requestBurst({ cid: 'c1', token: 't1' }), (err) => {
    assert.ok(err instanceof PlatformError);
    assert.equal(err.kind, 'server');
    assert.deepEqual(err.body, { raw: 'Bad Gateway' });
    return true;
  });
});

test('erro de rede vira kind network', async () => {
  const { client } = clientWith(() => {
    throw new TypeError('fetch failed');
  });

  await assert.rejects(client.requestBurst({ cid: 'c1', token: 't1' }), { kind: 'network' });
});

test('timeout vira kind timeout', async () => {
  const { client } = clientWith(
    (url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
    20,
  );

  await assert.rejects(client.requestBurst({ cid: 'c1', token: 't1' }), { kind: 'timeout' });
});
