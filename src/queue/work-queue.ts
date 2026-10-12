type Listener = () => void;

export class WorkQueue<T> {
  readonly #items: T[] = [];
  readonly #listeners = new Set<Listener>();
  #notifyScheduled = false;

  enqueue(item: T): void {
    this.#items.push(item);
    this.#scheduleNotify();
  }

  dequeue(): T | undefined {
    return this.#items.shift();
  }

  get size(): number {
    return this.#items.length;
  }

  onAvailable(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // setImmediate tira o consumidor do caminho da resposta HTTP e agrupa uma rajada num único aviso.
  #scheduleNotify(): void {
    if (this.#notifyScheduled) return;
    this.#notifyScheduled = true;
    setImmediate(() => {
      this.#notifyScheduled = false;
      for (const listener of this.#listeners) listener();
    });
  }
}
