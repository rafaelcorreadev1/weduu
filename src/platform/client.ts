import { PlatformError, kindFromStatus, parseRetryAfter } from './errors.ts';
import type { BurstResponse, Credentials, EnrichResponse, PlatformClient } from './types.ts';

interface PlatformClientOptions {
  baseUrl: string;
  timeoutMs: number;
  enrichTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export function createPlatformClient({
  baseUrl,
  timeoutMs,
  enrichTimeoutMs = timeoutMs,
  fetch = globalThis.fetch,
}: PlatformClientOptions): PlatformClient {
  async function request(
    method: string,
    path: string,
    { body, headers = {}, timeoutMs: requestTimeoutMs = timeoutMs }: RequestOptions = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (err) {
      const kind = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network';
      throw new PlatformError({ kind, cause: err });
    }

    const payload = await readJson(response);
    if (!response.ok) {
      throw new PlatformError({
        kind: kindFromStatus(response.status),
        status: response.status,
        body: payload,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      });
    }
    return payload;
  }

  return {
    async register({ name, webhook }) {
      const payload = await request('POST', '/register', { body: { name, webhook } });
      return expectShape<Credentials>(payload, { cid: 'string', token: 'string' });
    },

    async requestBurst({ cid, token }) {
      const payload = await request('POST', `/burst/${encodeURIComponent(cid)}`, {
        headers: { 'x-token': token },
      });
      return expectShape<BurstResponse>(payload, { run_id: 'string', total: 'number', started_at: 'string' });
    },

    async enrich(sku, { cid, token }) {
      const payload = await request('GET', `/enrich/${encodeURIComponent(sku)}`, {
        headers: { 'x-cid': cid, 'x-token': token },
        timeoutMs: enrichTimeoutMs,
      });
      return expectShape<EnrichResponse>(payload, { sku: 'string', price: 'number', stock: 'number' });
    },

    sendCallback(payload, { token }) {
      return request('POST', '/callback', { body: payload, headers: { 'x-token': token } });
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function expectShape<T>(payload: unknown, shape: Record<keyof T & string, 'string' | 'number'>): T {
  const record = payload as Record<string, unknown> | null;
  const valid =
    typeof record === 'object' &&
    record !== null &&
    Object.entries(shape).every(([key, type]) => typeof record[key] === type);

  if (!valid) {
    throw new PlatformError({ kind: 'invalid_response', body: payload });
  }
  return record as T;
}
