import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../../src/config.ts';
import { CredentialStore } from '../../src/platform/credentials.ts';
import { createService } from '../../src/service.ts';
import { silentLogger } from '../helpers.ts';
import { startFakePlatform, type FakePlatformOptions } from './fake-platform.ts';

const ADMIN_KEY = 'integration-key';

async function startStack(t: TestContext, platformOptions: FakePlatformOptions = {}) {
  const platform = await startFakePlatform(platformOptions);
  const config = loadConfig({
    PLATFORM_BASE_URL: platform.url,
    ADMIN_KEY,
    CREDENTIALS_FILE: join(await mkdtemp(join(tmpdir(), 'weduu-it-')), 'credentials.json'),
    RUN_IDLE_TIMEOUT_MS: '300',
  });
  const credentials = new CredentialStore({ file: config.credentialsFile });
  await credentials.load({});

  const service = createService({ config, logger: silentLogger, credentials });
  service.start();
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const webhook = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  t.after(async () => {
    service.stop();
    server.closeAllConnections();
    server.close();
    await platform.close();
  });

  const admin = async (path: string, body: unknown = {}) => {
    const res = await fetch(`${webhook}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  const register = await admin('/admin/register', { name: 'Integração', webhook });
  assert.equal(register.status, 200);

  return { platform, service, admin };
}

test('fluxo completo: register, burst, process, enrich e callback', async (t) => {
  const { platform, service, admin } = await startStack(t);

  const burst = await admin('/admin/burst');
  assert.equal(burst.status, 200);
  const runId = burst.body.run_id as string;

  await platform.waitForCallbacks(1);
  await delay(100);

  assert.equal(platform.callbacks.length, 1, 'apenas um callback automático');
  const [{ payload, report }] = platform.callbacks as [(typeof platform.callbacks)[number]];

  assert.equal(payload.run_id, runId);
  assert.equal(payload.cid, 'cid-fake');
  assert.deepEqual(payload.result.map((item) => item.seq), [...Array(20).keys()]);
  assert.deepEqual(payload.result.find((item) => item.seq === 13), {
    seq: 13,
    sku: `invalid-${runId}-13`,
    price: null,
    stock: null,
  });
  assert.deepEqual(report, { receivedItems: 20, divergences: 0, withoutPrice: 1, missingSeqs: [] });

  assert.equal(platform.stats.acks.length, 22, '20 mensagens + 2 duplicatas');
  assert.ok(platform.stats.acks.every((ack) => ack.status === 200));
  assert.ok(platform.stats.peakInFlight <= 3);
  assert.equal(platform.stats.serverErrors, 2, 'os 500 transitórios foram repetidos');
  assert.equal(platform.stats.enrichCalls, 22, '20 SKUs + 2 retries');

  assert.deepEqual(
    { ...service.runs.get(runId), startedAt: undefined },
    {
      runId,
      total: 20,
      startedAt: undefined,
      received: 20,
      duplicates: 2,
      pending: 0,
      done: 19,
      failed: 1,
      enrichCalls: 22,
    },
  );
});

test('mensagem que nunca chega gera callback parcial após o timeout de inatividade', async (t) => {
  const { platform, admin } = await startStack(t, { dropSeqs: [4] });

  await admin('/admin/burst');
  await platform.waitForCallbacks(1);

  const [{ payload, report }] = platform.callbacks as [(typeof platform.callbacks)[number]];
  assert.equal(payload.result.length, 19);
  assert.deepEqual(report.missingSeqs, [4]);
  assert.equal(report.divergences, 0);
});

test('plataforma mais restrita que o nosso limite: os 429 são tratados e nada se perde', async (t) => {
  const { platform, admin } = await startStack(t, { maxInFlight: 1, invalidSeqs: [], failFirstEnrichSeqs: [] });

  await admin('/admin/burst');
  await platform.waitForCallbacks(1, 20_000);

  const [{ report }] = platform.callbacks as [(typeof platform.callbacks)[number]];
  assert.ok(platform.stats.rateLimited > 0, 'a plataforma respondeu 429');
  assert.deepEqual(report, { receivedItems: 20, divergences: 0, withoutPrice: 0, missingSeqs: [] });
});
