import { realNow, realSleep, type Now, type Sleep } from '../resilience/timing.ts';

interface LimiterOptions {
  maxConcurrency: number;
  sleep?: Sleep;
  now?: Now;
}

export class ConcurrencyLimiter {
  readonly #max: number;
  readonly #sleep: Sleep;
  readonly #now: Now;
  readonly #waiters: Array<() => void> = [];
  #inFlight = 0;
  #pausedUntil = 0;

  constructor({ maxConcurrency, sleep = realSleep, now = realNow }: LimiterOptions) {
    this.#max = maxConcurrency;
    this.#sleep = sleep;
    this.#now = now;
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.#acquire();
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  pauseFor(ms: number): void {
    this.#pausedUntil = Math.max(this.#pausedUntil, this.#now() + ms);
  }

  // Em loop porque, enquanto esperava, outra chamada pode ter pausado o limiter ou pego a vaga liberada.
  async #acquire(): Promise<void> {
    for (;;) {
      const pause = this.#pausedUntil - this.#now();
      if (pause > 0) {
        await this.#sleep(pause);
        continue;
      }
      if (this.#inFlight < this.#max) {
        this.#inFlight += 1;
        return;
      }
      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    }
  }

  #release(): void {
    this.#inFlight -= 1;
    this.#waiters.shift()?.();
  }
}
