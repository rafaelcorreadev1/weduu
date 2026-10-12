import { readFile, rename, writeFile } from 'node:fs/promises';
import type { CredentialProvider, Credentials } from './types.ts';

export class CredentialStore implements CredentialProvider {
  readonly #file: string;
  #current: Credentials | null = null;

  constructor({ file }: { file: string }) {
    this.#file = file;
  }

  async load(env: NodeJS.ProcessEnv = process.env): Promise<Credentials | null> {
    if (env.WEDUU_CID && env.WEDUU_TOKEN) {
      this.#current = { cid: env.WEDUU_CID, token: env.WEDUU_TOKEN };
      return this.#current;
    }

    try {
      const data: unknown = JSON.parse(await readFile(this.#file, 'utf8'));
      if (isCredentials(data)) this.#current = { cid: data.cid, token: data.token };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return this.#current;
  }

  get(): Credentials | null {
    return this.#current;
  }

  async save({ cid, token }: Credentials): Promise<void> {
    const tmp = `${this.#file}.tmp`;
    await writeFile(tmp, JSON.stringify({ cid, token }, null, 2));
    await rename(tmp, this.#file);
    this.#current = { cid, token };
  }
}

function isCredentials(data: unknown): data is Credentials {
  const record = data as Partial<Credentials> | null;
  return typeof record?.cid === 'string' && record.cid !== '' && typeof record.token === 'string' && record.token !== '';
}
