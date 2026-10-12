import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { buildTestApp, silentLogger } from '../helpers.ts';
import { errorHandler } from '../../src/http/middlewares/errors.ts';

test('GET /health responde ok', async () => {
  const res = await request(buildTestApp().app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('rota inexistente responde 404 not_found', async () => {
  const res = await request(buildTestApp().app).get('/nao-existe');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'not_found' });
});

test('JSON malformado responde 400 e o app segue atendendo', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/check')
    .set('content-type', 'application/json')
    .send('{token:');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'invalid_json' });

  const health = await request(app).get('/health');
  assert.equal(health.status, 200);
});

test('exceção em handler responde 500 sem stack trace', async () => {
  const app = express();
  app.get('/boom', async () => {
    throw new Error('segredo interno');
  });
  app.use(errorHandler(silentLogger));

  const res = await request(app).get('/boom');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'internal_error' });
});
