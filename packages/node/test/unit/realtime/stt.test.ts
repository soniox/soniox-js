import { RealtimeSttSession } from '../../../src/realtime/stt';
import { StateError, AbortError, ConnectionError } from '../../../src/realtime/errors';

describe('RealtimeSttSession', () => {
  const mockApiKey = 'test-api-key';
  const mockWsBaseUrl = 'wss://test.soniox.com/transcribe-websocket';
  const mockConfig = { model: 'stt-rt-preview' };

  describe('initial state', () => {
    it('should start in idle state', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(session.state).toBe('idle');
    });

    it('should not be paused initially', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(session.paused).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('should throw StateError when sendAudio not connected', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);
      const audioData = new Uint8Array([1, 2, 3]);

      expect(() => session.sendAudio(audioData)).toThrow(StateError);
      expect(() => session.sendAudio(audioData)).toThrow('session is in "idle" state');
    });

    it('should reject finish when not connected', async () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      await expect(session.finish()).rejects.toThrow(StateError);
      await expect(session.finish()).rejects.toThrow('session is in "idle" state');
    });

    it('should allow close in any state', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(() => session.close()).not.toThrow();
      expect(session.state).toBe('canceled');
    });

    it('should emit disconnected on close', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);
      const handler = jest.fn();

      session.on('disconnected', handler);
      session.close();

      expect(handler).toHaveBeenCalledWith('client_closed');
    });

    it('should ignore finalize when not connected', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(() => session.finalize()).not.toThrow();
    });

    it('should ignore keepAlive when not connected', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(() => session.keepAlive()).not.toThrow();
    });
  });

  describe('finish', () => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      static instances: MockWebSocket[] = [];

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      binaryType = 'arraybuffer';
      private readonly listeners = new Map<string, Set<(event: any) => void>>();

      constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
      }

      addEventListener(type: string, listener: (event: any) => void): void {
        const handlers = this.listeners.get(type) ?? new Set();
        handlers.add(listener);
        this.listeners.set(type, handlers);
      }

      removeEventListener(type: string, listener: (event: any) => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      send(_data: unknown): void {
        if (this.readyState !== MockWebSocket.OPEN) {
          throw new Error('WebSocket is not open');
        }
      }

      open(): void {
        this.readyState = MockWebSocket.OPEN;
        this.dispatch('open', { type: 'open' });
      }

      close(reason = ''): void {
        if (this.readyState === MockWebSocket.CLOSED) {
          return;
        }
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch('close', { type: 'close', reason });
      }

      private dispatch(type: string, event: any): void {
        const handlers = this.listeners.get(type);
        if (!handlers) return;
        for (const handler of handlers) {
          handler(event);
        }
      }
    }

    const OriginalWebSocket = global.WebSocket;

    beforeEach(() => {
      MockWebSocket.instances = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).WebSocket = MockWebSocket;
    });

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).WebSocket = OriginalWebSocket;
    });

    it('should reject when socket closes before finished', async () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      const connectPromise = session.connect();
      const ws = MockWebSocket.instances[0];
      ws.open();
      await connectPromise;

      const finishPromise = session.finish();
      ws.close('server_closed');

      await expect(finishPromise).rejects.toThrow(ConnectionError);
    });
  });

  describe('abort signal', () => {
    it('should abort when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig, {
        signal: controller.signal,
      });

      await expect(session.connect()).rejects.toThrow(AbortError);
    });

    it('should throw AbortError on sendAudio when signal is already aborted', () => {
      const controller = new AbortController();
      controller.abort();

      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig, {
        signal: controller.signal,
      });

      expect(() => session.sendAudio(new Uint8Array([1]))).toThrow(AbortError);
    });
  });

  describe('pause/resume', () => {
    it('should track paused state', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(session.paused).toBe(false);

      session.pause();
      expect(session.paused).toBe(true);

      session.resume();
      expect(session.paused).toBe(false);
    });

    it('should be idempotent', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      session.pause();
      session.pause();
      session.pause();
      expect(session.paused).toBe(true);

      session.resume();
      session.resume();
      session.resume();
      expect(session.paused).toBe(false);
    });
  });

  describe('keepalive', () => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      static instances: MockWebSocket[] = [];

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      binaryType = 'arraybuffer';
      sent: unknown[] = [];
      private readonly listeners = new Map<string, Set<(event: any) => void>>();

      constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
      }

      addEventListener(type: string, listener: (event: any) => void): void {
        const handlers = this.listeners.get(type) ?? new Set();
        handlers.add(listener);
        this.listeners.set(type, handlers);
      }

      removeEventListener(type: string, listener: (event: any) => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      send(data: unknown): void {
        if (this.readyState !== MockWebSocket.OPEN) {
          throw new Error('WebSocket is not open');
        }
        this.sent.push(data);
      }

      open(): void {
        this.readyState = MockWebSocket.OPEN;
        this.dispatch('open', { type: 'open' });
      }

      close(reason = ''): void {
        if (this.readyState === MockWebSocket.CLOSED) {
          return;
        }
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch('close', { type: 'close', reason });
      }

      private dispatch(type: string, event: any): void {
        const handlers = this.listeners.get(type);
        if (!handlers) return;
        for (const handler of handlers) {
          handler(event);
        }
      }
    }

    const OriginalWebSocket = global.WebSocket;

    beforeEach(() => {
      MockWebSocket.instances = [];
      jest.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).WebSocket = MockWebSocket;
    });

    afterEach(() => {
      jest.useRealTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).WebSocket = OriginalWebSocket;
    });

    it('should send keepalive when enabled', async () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig, {
        keepalive: true,
        keepalive_interval_ms: 1000,
      });

      const connectPromise = session.connect();
      const ws = MockWebSocket.instances[0];
      ws.open();
      await connectPromise;

      jest.advanceTimersByTime(1000);

      const keepaliveMessage = JSON.stringify({ type: 'keepalive' });
      expect(ws.sent).toContain(keepaliveMessage);
    });
  });

  describe('event handlers', () => {
    it('should support on/off/once', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);
      const handler = jest.fn();

      session.on('result', handler);
      session.off('result', handler);

      expect(() => session.once('connected', () => {})).not.toThrow();
    });

    it('should return session for chaining', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      const result = session
        .on('result', () => {})
        .on('error', () => {})
        .once('connected', () => {});

      expect(result).toBe(session);
    });
  });

  describe('state_change and finished events', () => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      static instances: MockWebSocket[] = [];

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      binaryType = 'arraybuffer';
      sent: unknown[] = [];
      private readonly listeners = new Map<string, Set<(event: any) => void>>();

      constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
      }

      addEventListener(type: string, listener: (event: any) => void): void {
        const handlers = this.listeners.get(type) ?? new Set();
        handlers.add(listener);
        this.listeners.set(type, handlers);
      }

      removeEventListener(type: string, listener: (event: any) => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      send(data: unknown): void {
        if (this.readyState !== MockWebSocket.OPEN) {
          throw new Error('WebSocket is not open');
        }
        this.sent.push(data);
      }

      open(): void {
        this.readyState = MockWebSocket.OPEN;
        this.dispatch('open', { type: 'open' });
      }

      close(reason = ''): void {
        if (this.readyState === MockWebSocket.CLOSED) {
          return;
        }
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch('close', { type: 'close', reason });
      }

      message(data: string): void {
        this.dispatch('message', { data });
      }

      private dispatch(type: string, event: any): void {
        const handlers = this.listeners.get(type);
        if (!handlers) return;
        for (const handler of handlers) {
          handler(event);
        }
      }
    }

    const OriginalWebSocket = global.WebSocket;

    beforeEach(() => {
      MockWebSocket.instances = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).WebSocket = MockWebSocket;
    });

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).WebSocket = OriginalWebSocket;
    });

    it('should emit state_change on connect', async () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);
      const handler = jest.fn();

      session.on('state_change', handler);

      const connectPromise = session.connect();
      const ws = MockWebSocket.instances[0];
      ws.open();
      await connectPromise;

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, { old_state: 'idle', new_state: 'connecting' });
      expect(handler).toHaveBeenNthCalledWith(2, { old_state: 'connecting', new_state: 'connected' });
    });

    it('should emit finished when server signals completion', async () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);
      const handler = jest.fn();

      session.on('finished', handler);

      const connectPromise = session.connect();
      const ws = MockWebSocket.instances[0];
      ws.open();
      await connectPromise;

      const message = JSON.stringify({
        tokens: [],
        final_audio_proc_ms: 0,
        total_audio_proc_ms: 0,
        finished: true,
      });

      ws.message(message);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(session.state).toBe('finished');
    });
  });

  describe('async iterator', () => {
    it('should be async iterable', () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);

      expect(session[Symbol.asyncIterator]).toBeDefined();
      expect(typeof session[Symbol.asyncIterator]).toBe('function');
    });
  });
});
