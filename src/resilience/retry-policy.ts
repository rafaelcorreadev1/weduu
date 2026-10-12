import { PlatformError } from '../platform/errors.ts';

export interface RetryPolicyOptions {
  maxAttempts: number;
  maxRateLimitRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  defaultRetryAfterMs?: number;
  random?: () => number;
}

export interface RetryState {
  attempts: number;
  rateLimitHits: number;
}

export type RetryPolicy = (error: unknown, state: RetryState) => number | null;

export function createRetryPolicy({
  maxAttempts,
  maxRateLimitRetries = 20,
  baseDelayMs = 200,
  maxDelayMs = 3_000,
  defaultRetryAfterMs = 1_000,
  random = Math.random,
}: RetryPolicyOptions): RetryPolicy {
  return (error, { attempts, rateLimitHits }) => {
    if (!(error instanceof PlatformError) || !error.retryable) return null;

    if (error.kind === 'rate_limited') {
      return rateLimitHits >= maxRateLimitRetries ? null : (error.retryAfterMs ?? defaultRetryAfterMs);
    }

    if (attempts >= maxAttempts) return null;
    const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempts - 1));
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
  };
}
