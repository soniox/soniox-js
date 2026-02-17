import { AsyncEventQueue } from '@soniox/core';

describe('AsyncEventQueue', () => {
  describe('push', () => {
    it('should deliver events to waiting consumer', async () => {
      const queue = new AsyncEventQueue<string>();

      const promise = (async () => {
        const results: string[] = [];
        for await (const event of queue) {
          results.push(event);
          if (results.length === 2) break;
        }
        return results;
      })();

      queue.push('first');
      queue.push('second');

      const results = await promise;
      expect(results).toEqual(['first', 'second']);
    });

    it('should queue events when no consumer waiting', async () => {
      const queue = new AsyncEventQueue<number>();

      queue.push(1);
      queue.push(2);
      queue.push(3);

      const results: number[] = [];
      for await (const event of queue) {
        results.push(event);
        if (results.length === 3) break;
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it('should not push events after end', async () => {
      const queue = new AsyncEventQueue<string>();

      queue.push('before');
      queue.end();
      queue.push('after');

      const results: string[] = [];
      for await (const event of queue) {
        results.push(event);
      }

      expect(results).toEqual(['before']);
    });
  });

  describe('end', () => {
    it('should end iteration', async () => {
      const queue = new AsyncEventQueue<string>();

      queue.push('event');
      queue.end();

      const results: string[] = [];
      for await (const event of queue) {
        results.push(event);
      }

      expect(results).toEqual(['event']);
    });

    it('should resolve waiting consumers with done', async () => {
      const queue = new AsyncEventQueue<string>();

      const promise = (async () => {
        const results: string[] = [];
        for await (const event of queue) {
          results.push(event);
        }
        return results;
      })();

      // Small delay to ensure consumer is waiting
      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.end();

      const results = await promise;
      expect(results).toEqual([]);
    });

    it('should be idempotent', async () => {
      const queue = new AsyncEventQueue<string>();

      queue.push('event');
      queue.end();
      queue.end();
      queue.end();

      const results: string[] = [];
      for await (const event of queue) {
        results.push(event);
      }

      expect(results).toEqual(['event']);
    });
  });

  describe('abort', () => {
    it('should reject waiting consumers', async () => {
      const queue = new AsyncEventQueue<string>();
      const error = new Error('Test abort');

      const promise = (async () => {
        const results: string[] = [];
        for await (const event of queue) {
          results.push(event);
        }
        return results;
      })();

      // Small delay to ensure consumer is waiting
      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.abort(error);

      await expect(promise).rejects.toThrow('Test abort');
    });

    it('should reject future next calls', async () => {
      const queue = new AsyncEventQueue<string>();
      const error = new Error('Test abort');

      queue.abort(error);

      const iterator = queue[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow('Test abort');
    });

    it('should reject immediately even with queued events', async () => {
      const queue = new AsyncEventQueue<string>();
      const error = new Error('Test abort');

      queue.push('first');
      queue.push('second');
      queue.abort(error);

      const iterator = queue[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow('Test abort');
    });
  });

  describe('isDone', () => {
    it('should be false initially', () => {
      const queue = new AsyncEventQueue<string>();

      expect(queue.isDone).toBe(false);
    });

    it('should be true after end', () => {
      const queue = new AsyncEventQueue<string>();
      queue.end();

      expect(queue.isDone).toBe(true);
    });

    it('should be true after abort', () => {
      const queue = new AsyncEventQueue<string>();
      queue.abort(new Error('Test'));

      expect(queue.isDone).toBe(true);
    });
  });

  describe('async iteration', () => {
    it('should work with for-await-of', async () => {
      const queue = new AsyncEventQueue<number>();

      const promise = (async () => {
        const results: number[] = [];
        for await (const n of queue) {
          results.push(n);
        }
        return results;
      })();

      queue.push(1);
      queue.push(2);
      queue.push(3);
      queue.end();

      const results = await promise;
      expect(results).toEqual([1, 2, 3]);
    });

    it('should support multiple concurrent iterators', async () => {
      const queue = new AsyncEventQueue<string>();

      queue.push('a');
      queue.push('b');

      const iterator1 = queue[Symbol.asyncIterator]();
      const iterator2 = queue[Symbol.asyncIterator]();

      const result1 = await iterator1.next();
      const result2 = await iterator2.next();

      // Both iterators share the same queue
      expect(result1).toEqual({ value: 'a', done: false });
      expect(result2).toEqual({ value: 'b', done: false });
    });
  });
});
