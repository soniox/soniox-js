/**
 * Generic async event queue that supports iteration with proper error propagation.
 *
 * This utility enables `for await...of` consumption of events while properly
 * surfacing errors to consumers instead of silently ending iteration.
 */
export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  private done = false;
  private error: Error | null = null;

  /**
   * Push an event to the queue.
   * If there are waiting consumers, delivers immediately.
   */
  push(event: T): void {
    if (this.done) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  /**
   * End the queue normally.
   * Waiting consumers will receive `{ done: true }`.
   */
  end(): void {
    if (this.done) return;

    this.done = true;
    this.flushWaiters();
  }

  /**
   * End the queue with an error.
   * Waiting consumers will have their promises rejected.
   * Future `next()` calls will also reject with this error.
   * Any queued events are discarded.
   */
  abort(error: Error): void {
    if (this.done) return;

    this.done = true;
    this.error = error;
    this.queue = [];
    this.flushWaiters();
  }

  /**
   * Whether the queue has ended (normally or with error).
   */
  get isDone(): boolean {
    return this.done;
  }

  /**
   * Async iterator implementation.
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    };
  }

  /**
   * Get the next event from the queue.
   */
  private next(): Promise<IteratorResult<T>> {
    const error = this.error;
    if (error) {
      return Promise.reject(error);
    }

    // If there are queued events, return immediately
    const event = this.queue.shift();
    if (event !== undefined) {
      return Promise.resolve({ value: event, done: false });
    }

    // If done, return done or reject with error
    if (this.done) {
      return Promise.resolve({ value: undefined as never, done: true });
    }

    // Wait for next event
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /**
   * Flush all waiting consumers when queue ends.
   */
  private flushWaiters(): void {
    for (const { resolve, reject } of this.waiters) {
      if (this.error) {
        reject(this.error);
      } else {
        resolve({ value: undefined as never, done: true });
      }
    }
    this.waiters = [];
  }
}
