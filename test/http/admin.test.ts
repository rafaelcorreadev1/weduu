import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Express } from 'express';
import request from 'supertest';
import type { CallbackService, CallbackView, ResendOutcome } from '../../src/callback/run-finalizer.ts';
import { loadConfig } from '../../src/config.ts';
import { PlatformError } from '../../src/platform/errors.ts';
import type { BurstResponse, Credentials, PlatformClient, RegisterInput } from '../../src/platform/types.ts';
import { ADMIN_KEY, buildTestApp, fakeCredentials, unusedPlatform } from '../helpers.ts';

const RUN: BurstResponse = { run_id: 'r1', total: 20, started_at: '2026-08-03T12:00:00Z' };

interface FakePlatformOptions {
  register?: (input: RegisterInput) => Credentials;
  requestBurst?: (creds: Credentials) => BurstResponse;
}

function fakePlatform({ register, requestBurst }: FakePlatformOptions = {}) {
  const calls = { register: [] as RegisterInput[], requestBurst: [] as Credentials[] };
  const platform: PlatformClient = {
    ...unusedPlatform,
    async register(input) {
      calls.register.push(input);
      return register ? register(input) : { cid: 'c1', token: 't1' };
    },
    async requestBurst(creds) {
      calls.requestBurst.push(creds);
      return requestBurst ? requestBurst(creds) : RUN;
    },
  };
  return { platform, calls };
}

const failingWith = (init: ConstructorParameters<typeof PlatformError>[0]) => () => {
  throw new PlatformError(init);
};

const admin = (app: Express, path: string) => request(app).post(path).set('x-admin-key', ADMIN_KEY);

test('rotas /admin desligadas sem ADMIN_KEY', async () => {
  const { app } = buildTestApp({ config: loadConfig({}) });
  const res = await request(app).post('/admin/burst');
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { error: 'admin_disabled' });
});

for (const key of [undefined, 'errada']) {
  test(`rotas /admin recusam chave ${key ?? 'ausente'}`, async () => {
    const { platform, calls } = fakePlatform();
    const { app } = buildTestApp({ platform });
    const req = request(app).post('/admin/register');
    const res = await (key ? req.set('x-admin-key', key) : req).send({ name: 'Fulano' });

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
    assert.equal(calls.register.length, 0);
  });
}

test('register bem-sucedido salva credenciais e não devolve o token', async () => {
  const { platform, calls } = fakePlatform();
  const credentials = fakeCredentials();
  const { app } = buildTestApp({ platform, credentials });

  const res = await admin(app, '/admin/register').send({ name: 'Fulano', webhook: 'https://x.ngrok.app' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { cid: 'c1' });
  assert.deepEqual(calls.register[0], { name: 'Fulano', webhook: 'https://x.ngrok.app' });
  assert.deepEqual(credentials.get(), { cid: 'c1', token: 't1' });
});

test('register usa PUBLIC_URL quando webhook é omitido', async () => {
  const { platform, calls } = fakePlatform();
  const { app } = buildTestApp({ platform });

  await admin(app, '/admin/register').send({ name: 'Fulano' });

  assert.equal(calls.register[0]?.webhook, 'https://public.example');
});

test('register sem name ou sem webhook responde 400', async () => {
  const { platform, calls } = fakePlatform();
  const noPublicUrl = loadConfig({ ADMIN_KEY });

  const a = await admin(buildTestApp({ platform }).app, '/admin/register').send({});
  const b = await admin(buildTestApp({ platform, config: noPublicUrl }).app, '/admin/register').send({ name: 'x' });

  assert.equal(a.status, 400);
  assert.deepEqual(a.body, { error: 'invalid_request' });
  assert.equal(b.status, 400);
  assert.equal(calls.register.length, 0);
});

test('register com handshake recusado responde 422 e mantém credenciais', async () => {
  const { platform } = fakePlatform({
    register: failingWith({
      kind: 'handshake_failed',
      status: 422,
      body: { error: 'handshake_failed', reason: 'timeout' },
    }),
  });
  const credentials = fakeCredentials({ cid: 'old', token: 'old' });
  const { app } = buildTestApp({ platform, credentials });

  const res = await admin(app, '/admin/register').send({ name: 'Fulano' });

  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { error: 'handshake_failed', reason: 'timeout' });
  assert.deepEqual(credentials.get(), { cid: 'old', token: 'old' });
});

for (const kind of ['network', 'timeout', 'server'] as const) {
  test(`register com falha ${kind} responde 502`, async () => {
    const { platform } = fakePlatform({ register: failingWith({ kind }) });

    const res = await admin(buildTestApp({ platform }).app, '/admin/register').send({ name: 'Fulano' });

    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { error: 'platform_unavailable' });
  });
}

test('burst sem credenciais responde 409', async () => {
  const { platform, calls } = fakePlatform();

  const res = await admin(buildTestApp({ platform }).app, '/admin/burst');

  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'not_registered' });
  assert.equal(calls.requestBurst.length, 0);
});

test('burst bem-sucedido publica o run e devolve os dados', async () => {
  const { platform, calls } = fakePlatform();
  const credentials = fakeCredentials({ cid: 'c1', token: 't1' });
  const { app, startedRuns } = buildTestApp({ platform, credentials });

  const res = await admin(app, '/admin/burst');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, RUN);
  assert.deepEqual(calls.requestBurst[0], { cid: 'c1', token: 't1' });
  assert.deepEqual(startedRuns, [{ runId: 'r1', total: 20, startedAt: '2026-08-03T12:00:00Z' }]);
});

test('burst com 401 responde platform_unauthorized', async () => {
  const { platform } = fakePlatform({ requestBurst: failingWith({ kind: 'unauthorized', status: 401 }) });
  const credentials = fakeCredentials({ cid: 'c1', token: 't1' });
  const { app, startedRuns } = buildTestApp({ platform, credentials });

  const res = await admin(app, '/admin/burst');

  assert.equal(res.status, 502);
  assert.deepEqual(res.body, { error: 'platform_unauthorized' });
  assert.equal(startedRuns.length, 0);
});

test('burst com falha de rede responde platform_unavailable', async () => {
  const { platform } = fakePlatform({ requestBurst: failingWith({ kind: 'network' }) });
  const credentials = fakeCredentials({ cid: 'c1', token: 't1' });

  const res = await admin(buildTestApp({ platform, credentials }).app, '/admin/burst');

  assert.equal(res.status, 502);
  assert.deepEqual(res.body, { error: 'platform_unavailable' });
});

test('GET /admin/runs/:runId devolve o estado do run', async () => {
  const { app, runs } = buildTestApp();
  runs.startRun({ runId: 'r1', total: 20, startedAt: '2026-08-03T12:00:00Z' });
  for (const seq of [0, 1, 2, 1]) runs.recordMessage({ runId: 'r1', seq, sku: `sku-${seq}` });
  runs.markDone('r1', 0, { price: 10, stock: 1 });
  runs.markFailed('r1', 1, 'not_found');
  runs.recordEnrichCall('r1');
  runs.recordEnrichCall('r1');

  const res = await request(app).get('/admin/runs/r1').set('x-admin-key', ADMIN_KEY);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    run_id: 'r1',
    total: 20,
    started_at: '2026-08-03T12:00:00Z',
    received: 3,
    duplicates: 1,
    pending: 1,
    done: 1,
    failed: 1,
    enrich_calls: 2,
    callback: { status: 'idle' },
  });
});

test('GET /admin/runs/:runId de run inexistente responde 404', async () => {
  const res = await request(buildTestApp().app).get('/admin/runs/nao-existe').set('x-admin-key', ADMIN_KEY);

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'run_not_found' });
});

const SENT_CALLBACK: CallbackView = {
  status: 'sent',
  reason: 'manual',
  attempts: 1,
  error: null,
  sentAt: '2026-08-03T12:00:05Z',
  response: { report: 'ok' },
};

function fakeCallbacks(outcome: ResendOutcome): CallbackService {
  return { callback: () => SENT_CALLBACK, resend: async () => outcome };
}

test('GET /admin/runs/:runId inclui o estado do callback', async () => {
  const { app, runs } = buildTestApp({ callbacks: fakeCallbacks({ outcome: 'run_not_found' }) });
  runs.recordMessage({ runId: 'r1', seq: 0, sku: 'a' });

  const res = await request(app).get('/admin/runs/r1').set('x-admin-key', ADMIN_KEY);

  assert.deepEqual(res.body.callback, {
    status: 'sent',
    reason: 'manual',
    attempts: 1,
    error: null,
    sent_at: '2026-08-03T12:00:05Z',
    response: { report: 'ok' },
  });
});

test('POST /admin/runs/:runId/callback reenvia e devolve o estado', async () => {
  const { app } = buildTestApp({ callbacks: fakeCallbacks({ outcome: 'sent', callback: SENT_CALLBACK }) });

  const res = await admin(app, '/admin/runs/r1/callback');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'sent');
  assert.equal(res.body.reason, 'manual');
});

test('POST /admin/runs/:runId/callback com run inexistente ou em andamento', async () => {
  const notFound = await admin(buildTestApp({ callbacks: fakeCallbacks({ outcome: 'run_not_found' }) }).app, '/admin/runs/x/callback');
  const busy = await admin(buildTestApp({ callbacks: fakeCallbacks({ outcome: 'in_progress' }) }).app, '/admin/runs/x/callback');

  assert.equal(notFound.status, 404);
  assert.deepEqual(notFound.body, { error: 'run_not_found' });
  assert.equal(busy.status, 409);
  assert.deepEqual(busy.body, { error: 'callback_in_progress' });
});

test('GET /admin/runs/:runId exige x-admin-key', async () => {
  const res = await request(buildTestApp().app).get('/admin/runs/r1');

  assert.equal(res.status, 401);
});
