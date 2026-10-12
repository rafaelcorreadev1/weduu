import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../../src/platform/credentials.ts';

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'weduu-creds-'));
  return join(dir, 'creds.json');
}

test('sem arquivo e sem env não há credenciais', async () => {
  const store = new CredentialStore({ file: await tempFile() });
  assert.equal(await store.load({}), null);
  assert.equal(store.get(), null);
});

test('save grava no arquivo e um novo store recarrega', async () => {
  const file = await tempFile();
  await new CredentialStore({ file }).save({ cid: 'c1', token: 't1' });

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { cid: 'c1', token: 't1' });

  const reloaded = new CredentialStore({ file });
  assert.deepEqual(await reloaded.load({}), { cid: 'c1', token: 't1' });
});

test('envs têm precedência sobre o arquivo', async () => {
  const file = await tempFile();
  await writeFile(file, JSON.stringify({ cid: 'arquivo', token: 'arquivo' }));

  const store = new CredentialStore({ file });
  await store.load({ WEDUU_CID: 'env-cid', WEDUU_TOKEN: 'env-token' });

  assert.deepEqual(store.get(), { cid: 'env-cid', token: 'env-token' });
});

test('arquivo incompleto é ignorado', async () => {
  const file = await tempFile();
  await writeFile(file, JSON.stringify({ cid: 'c1' }));

  assert.equal(await new CredentialStore({ file }).load({}), null);
});
