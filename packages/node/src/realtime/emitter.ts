/**
 * A minimal, runtime-agnostic typed event emitter.
 * Does not depend on Node.js EventEmitter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TypedEmitter<Events extends Record<string, (...args: any[]) => void>> {
  private listeners = new Map<keyof Events, Set<Events[keyof Events]>>();
  private readonly errorEvent = 'error' as keyof Events;

  /**
   * Register an event handler.
   */
  on<E extends keyof Events>(event: E, handler: Events[E]): this {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
    return this;
  }

  /**
   * Register a one-time event handler.
   */
  once<E extends keyof Events>(event: E, handler: Events[E]): this {
    const wrapper = ((...args: Parameters<Events[E]>) => {
      this.off(event, wrapper);
      (handler as (...args: Parameters<Events[E]>) => void)(...args);
    }) as Events[E];
    return this.on(event, wrapper);
  }

  /**
   * Remove an event handler.
   */
  off<E extends keyof Events>(event: E, handler: Events[E]): this {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  /**
   * Emit an event to all registered handlers.
   * Handler errors do not prevent other handlers from running.
   * Errors are reported to an `error` event if present, otherwise rethrown async.
   */
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of [...handlers]) {
        try {
          (handler as (...args: Parameters<Events[E]>) => void)(...args);
        } catch (error) {
          if (event === this.errorEvent) {
            this.scheduleThrow(this.normalizeError(error));
          } else {
            this.reportListenerError(error);
          }
        }
      }
    }
  }

  /**
   * Remove all event handlers.
   */
  removeAllListeners(event?: keyof Events): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  private reportListenerError(error: unknown): void {
    const normalizedError = this.normalizeError(error);
    const handlers = this.listeners.get(this.errorEvent);
    if (!handlers || handlers.size === 0) {
      this.scheduleThrow(normalizedError);
      return;
    }

    for (const handler of [...handlers]) {
      try {
        (handler as (error: Error) => void)(normalizedError);
      } catch (handlerError) {
        this.scheduleThrow(this.normalizeError(handlerError));
      }
    }
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  private scheduleThrow(error: Error): void {
    setTimeout(() => {
      throw error;
    }, 0);
  }
}
