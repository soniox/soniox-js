import { TypedEmitter } from '@soniox/core';

// Define test event types
interface TestEvents {
  message: (text: string) => void;
  count: (n: number) => void;
  multi: (a: string, b: number) => void;
  noArgs: () => void;
  error: (error: Error) => void;
}

describe('TypedEmitter', () => {
  let emitter: TypedEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new TypedEmitter<TestEvents>();
  });

  describe('on', () => {
    it('should register an event handler', () => {
      const handler = jest.fn();
      emitter.on('message', handler);

      emitter.emit('message', 'hello');

      expect(handler).toHaveBeenCalledWith('hello');
    });

    it('should allow multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on('message', handler1);
      emitter.on('message', handler2);
      emitter.emit('message', 'test');

      expect(handler1).toHaveBeenCalledWith('test');
      expect(handler2).toHaveBeenCalledWith('test');
    });

    it('should return this for chaining', () => {
      const result = emitter.on('message', () => {});

      expect(result).toBe(emitter);
    });

    it('should handle events with multiple arguments', () => {
      const handler = jest.fn();
      emitter.on('multi', handler);

      emitter.emit('multi', 'text', 42);

      expect(handler).toHaveBeenCalledWith('text', 42);
    });

    it('should handle events with no arguments', () => {
      const handler = jest.fn();
      emitter.on('noArgs', handler);

      emitter.emit('noArgs');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith();
    });
  });

  describe('once', () => {
    it('should call handler only once', () => {
      const handler = jest.fn();
      emitter.once('message', handler);

      emitter.emit('message', 'first');
      emitter.emit('message', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should return this for chaining', () => {
      const result = emitter.once('message', () => {});

      expect(result).toBe(emitter);
    });
  });

  describe('off', () => {
    it('should remove a handler', () => {
      const handler = jest.fn();
      emitter.on('message', handler);
      emitter.off('message', handler);

      emitter.emit('message', 'test');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove the specified handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on('message', handler1);
      emitter.on('message', handler2);
      emitter.off('message', handler1);

      emitter.emit('message', 'test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith('test');
    });

    it('should return this for chaining', () => {
      const handler = () => {};
      emitter.on('message', handler);
      const result = emitter.off('message', handler);

      expect(result).toBe(emitter);
    });

    it('should handle removing non-existent handler gracefully', () => {
      const handler = jest.fn();

      expect(() => emitter.off('message', handler)).not.toThrow();
    });
  });

  describe('emit', () => {
    it('should not throw when no handlers registered', () => {
      expect(() => emitter.emit('message', 'test')).not.toThrow();
    });

    it('should isolate handler errors and report them', () => {
      const errorHandler = jest.fn();
      const failingHandler = jest.fn(() => {
        throw new Error('boom');
      });
      const otherHandler = jest.fn();

      emitter.on('error', errorHandler);
      emitter.on('message', failingHandler);
      emitter.on('message', otherHandler);

      expect(() => emitter.emit('message', 'test')).not.toThrow();

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(otherHandler).toHaveBeenCalledTimes(1);
      expect(otherHandler).toHaveBeenCalledWith('test');
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
      expect((errorHandler.mock.calls[0][0] as Error).message).toBe('boom');
    });

    it('should allow handler to remove itself during emit', () => {
      const handler = jest.fn(() => {
        emitter.off('message', handler);
      });
      const otherHandler = jest.fn();

      emitter.on('message', handler);
      emitter.on('message', otherHandler);

      emitter.emit('message', 'test');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(otherHandler).toHaveBeenCalledTimes(1);

      // Second emit - handler should not be called
      emitter.emit('message', 'test2');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(otherHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all handlers for a specific event', () => {
      const messageHandler = jest.fn();
      const countHandler = jest.fn();

      emitter.on('message', messageHandler);
      emitter.on('count', countHandler);
      emitter.removeAllListeners('message');

      emitter.emit('message', 'test');
      emitter.emit('count', 42);

      expect(messageHandler).not.toHaveBeenCalled();
      expect(countHandler).toHaveBeenCalledWith(42);
    });

    it('should remove all handlers for all events when no event specified', () => {
      const messageHandler = jest.fn();
      const countHandler = jest.fn();

      emitter.on('message', messageHandler);
      emitter.on('count', countHandler);
      emitter.removeAllListeners();

      emitter.emit('message', 'test');
      emitter.emit('count', 42);

      expect(messageHandler).not.toHaveBeenCalled();
      expect(countHandler).not.toHaveBeenCalled();
    });
  });
});
