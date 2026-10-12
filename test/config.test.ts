import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';

test('usa defaults quando env está vazio', () => {
  const config = loadConfig({});
  assert.equal(config.port, 4000);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.platformTimeoutMs, 10_000);
  assert.equal(config.adminKey, '');
  assert.equal(config.publicUrl, '');
  assert.equal(config.credentialsFile, '.credentials.json');
  assert.equal(config.enrichMaxConcurrency, 3);
  assert.equal(config.enrichTimeoutMs, 3_000);
  assert.equal(config.enrichMaxAttempts, 5);
  assert.equal(config.runIdleTimeoutMs, 10_000);
  assert.match(config.platformBaseUrl, /^https:\/\/.+\.run\.app$/);
});

test('remove barra final das URLs', () => {
  const config = loadConfig({
    PLATFORM_BASE_URL: 'http://localhost:9000/',
    PUBLIC_URL: 'https://x.ngrok.app/',
  });
  assert.equal(config.platformBaseUrl, 'http://localhost:9000');
  assert.equal(config.publicUrl, 'https://x.ngrok.app');
});

test('rejeita números inválidos', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT inválida/);
  assert.throws(() => loadConfig({ PLATFORM_TIMEOUT_MS: '0' }), /PLATFORM_TIMEOUT_MS inválida/);
});
