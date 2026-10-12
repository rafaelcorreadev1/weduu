import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from '../helpers.ts';

test('POST /check ecoa o token', async () => {
  const res = await request(buildTestApp().app).post('/check').send({ token: 'a3f9' });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] ?? '', /application\/json/);
  assert.deepEqual(res.body, { token: 'a3f9' });
});

for (const body of [{}, { token: '' }, { token: 123 }]) {
  test(`POST /check rejeita token inválido: ${JSON.stringify(body)}`, async () => {
    const res = await request(buildTestApp().app).post('/check').send(body);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'invalid_token' });
  });
}
