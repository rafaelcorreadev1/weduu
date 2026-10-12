import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { CallbackPayload } from '../../src/platform/types.ts';

// Imita o contrato da "Documentação Técnica da Integração" para testar o fluxo completo sem a plataforma real.

export interface FakePlatformOptions {
  total?: number;
  maxInFlight?: number;
  latencyMs?: [number, number];
  invalidSeqs?: number[];
  failFirstEnrichSeqs?: number[];
  duplicateSeqs?: number[];
  dropSeqs?: number[];
  retryAfterSeconds?: string;
}

export interface FakeReport {
  receivedItems: number;
  divergences: number;
  withoutPrice: number;
  missingSeqs: number[];
}

export interface FakeStats {
  enrichCalls: number;
  rateLimited: number;
  serverErrors: number;
  notFound: number;
  peakInFlight: number;
  acks: { status: number; ms: number }[];
}

export interface FakePlatform {
  url: string;
  stats: FakeStats;
  callbacks: { payload: CallbackPayload; report: FakeReport }[];
  waitForCallbacks(count: number, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

interface RunData {
  runId: string;
  skus: Map<number, string>;
}

export async function startFakePlatform(options: FakePlatformOptions = {}): Promise<FakePlatform> {
  const {
    total = 20,
    maxInFlight = 3,
    latencyMs = [20, 40],
    invalidSeqs = [13],
    failFirstEnrichSeqs = [2, 9],
    duplicateSeqs = [3, 7],
    dropSeqs = [],
    retryAfterSeconds = '0.05',
  } = options;

  const cid = 'cid-fake';
  const token = 'token-fake';
  let webhook = '';
  let inFlight = 0;
  const served = new Map<string, { price: number; stock: number }>();
  const failedOnce = new Set<string>();
  const runs = new Map<string, RunData>();
  const stats: FakeStats = { enrichCalls: 0, rateLimited: 0, serverErrors: 0, notFound: 0, peakInFlight: 0, acks: [] };
  const callbacks: FakePlatform['callbacks'] = [];

  const seqOf = (sku: string) => Number(sku.split('-').at(-1));

  async function fireMessages({ runId, skus }: RunData): Promise<void> {
    const seqs = [...skus.keys()].filter((seq) => !dropSeqs.includes(seq));
    const messages = [...seqs, ...duplicateSeqs].sort(() => Math.random() - 0.5);

    await Promise.all(
      messages.map(async (seq, index) => {
        await delay(index * 3);
        const start = performance.now();
        const response = await fetch(`${webhook}/process`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ run_id: runId, seq, sku: skus.get(seq) }),
        });
        stats.acks.push({ status: response.status, ms: performance.now() - start });
      }),
    );
  }

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse, path: string) => Promise<void>> = {
    async 'POST /register'(req, res) {
      const body = (await readBody(req)) as { webhook: string };
      webhook = body.webhook;
      const check = await fetch(`${webhook}/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const echoed = ((await check.json().catch(() => null)) as { token?: string } | null)?.token;
      if (echoed !== token) return send(res, 422, { error: 'handshake_failed', reason: 'token mismatch' });
      send(res, 200, { cid, token });
    },

    async 'POST /burst'(req, res, path) {
      if (path !== `/burst/${cid}` || req.headers['x-token'] !== token) return send(res, 401, { error: 'unauthorized' });

      const runId = `run-${runs.size + 1}`;
      const skus = new Map<number, string>();
      for (let seq = 0; seq < total; seq++) {
        skus.set(seq, invalidSeqs.includes(seq) ? `invalid-${runId}-${seq}` : `sku-${runId}-${seq}`);
      }
      const run = { runId, skus };
      runs.set(runId, run);

      send(res, 200, { run_id: runId, total, started_at: new Date().toISOString() });
      setTimeout(() => void fireMessages(run), 10);
    },

    async 'GET /enrich'(req, res, path) {
      stats.enrichCalls += 1;
      if (req.headers['x-cid'] !== cid || req.headers['x-token'] !== token) return send(res, 401, { error: 'unauthorized' });
      if (inFlight >= maxInFlight) {
        stats.rateLimited += 1;
        return send(res, 429, { error: 'too_many_requests' }, { 'retry-after': retryAfterSeconds });
      }

      inFlight += 1;
      stats.peakInFlight = Math.max(stats.peakInFlight, inFlight);
      try {
        await delay(latencyMs[0] + Math.random() * (latencyMs[1] - latencyMs[0]));
        const sku = decodeURIComponent(path.slice('/enrich/'.length));
        const seq = seqOf(sku);

        if (sku.startsWith('invalid-')) {
          stats.notFound += 1;
          return send(res, 404, { error: 'not_found' });
        }
        if (failFirstEnrichSeqs.includes(seq) && !failedOnce.has(sku)) {
          failedOnce.add(sku);
          stats.serverErrors += 1;
          return send(res, 500, { error: 'transient' });
        }

        const data = served.get(sku) ?? { price: seq * 10 + 0.9, stock: seq };
        served.set(sku, data);
        send(res, 200, { sku, ...data });
      } finally {
        inFlight -= 1;
      }
    },

    async 'POST /callback'(req, res) {
      if (req.headers['x-token'] !== token) return send(res, 401, { error: 'unauthorized' });
      const payload = (await readBody(req)) as CallbackPayload;
      const run = runs.get(payload.run_id);
      const receivedSeqs = new Set(payload.result.map((item) => item.seq));

      const report: FakeReport = {
        receivedItems: payload.result.length,
        divergences: payload.result.filter((item) => {
          const truth = served.get(item.sku);
          return truth ? truth.price !== item.price || truth.stock !== item.stock : item.price !== null;
        }).length,
        withoutPrice: payload.result.filter((item) => item.price === null).length,
        missingSeqs: run ? [...run.skus.keys()].filter((seq) => !receivedSeqs.has(seq)) : [],
      };
      callbacks.push({ payload, report });
      send(res, 200, { report });
    },
  };

  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    const route = routes[`${req.method} /${path.split('/')[1]}`];
    if (!route) return send(res, 404, { error: 'not_found' });
    route(req, res, path).catch((err: unknown) => send(res, 500, { error: String(err) }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stats,
    callbacks,
    async waitForCallbacks(count, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (callbacks.length < count) {
        if (Date.now() > deadline) throw new Error(`esperava ${count} callback(s), recebeu ${callbacks.length}`);
        await delay(10);
      }
    },
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}
