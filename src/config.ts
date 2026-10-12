const DEFAULT_PLATFORM_BASE_URL = 'https://dev-wdu-ped-test-1014944555984.us-central1.run.app';

export interface Config {
  readonly port: number;
  readonly platformBaseUrl: string;
  readonly platformTimeoutMs: number;
  readonly logLevel: string;
  readonly adminKey: string;
  readonly publicUrl: string;
  readonly credentialsFile: string;
  readonly enrichMaxConcurrency: number;
  readonly enrichTimeoutMs: number;
  readonly enrichMaxAttempts: number;
  readonly runIdleTimeoutMs: number;
}

function positiveInt(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} inválida: ${value}`);
  }
  return parsed;
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Object.freeze({
    port: positiveInt('PORT', env.PORT, 4000),
    platformBaseUrl: withoutTrailingSlash(env.PLATFORM_BASE_URL || DEFAULT_PLATFORM_BASE_URL),
    platformTimeoutMs: positiveInt('PLATFORM_TIMEOUT_MS', env.PLATFORM_TIMEOUT_MS, 10_000),
    logLevel: env.LOG_LEVEL || 'info',
    adminKey: env.ADMIN_KEY || '',
    publicUrl: withoutTrailingSlash(env.PUBLIC_URL || ''),
    credentialsFile: env.CREDENTIALS_FILE || '.credentials.json',
    enrichMaxConcurrency: positiveInt('ENRICH_MAX_CONCURRENCY', env.ENRICH_MAX_CONCURRENCY, 3),
    enrichTimeoutMs: positiveInt('ENRICH_TIMEOUT_MS', env.ENRICH_TIMEOUT_MS, 3_000),
    enrichMaxAttempts: positiveInt('ENRICH_MAX_ATTEMPTS', env.ENRICH_MAX_ATTEMPTS, 5),
    runIdleTimeoutMs: positiveInt('RUN_IDLE_TIMEOUT_MS', env.RUN_IDLE_TIMEOUT_MS, 10_000),
  });
}
