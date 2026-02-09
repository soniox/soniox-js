import { RealtimeSttSession } from '../../../src/realtime/stt';
import { StateError, AbortError, ConnectionError } from '../../../src/realtime/errors';
import { MockWebSocket, installMockWebSocket, restoreMockWebSocket } from '../../utils/mock-websocket';

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
    beforeEach(() => {
      installMockWebSocket();
    });

    afterEach(() => {
      restoreMockWebSocket();
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
    beforeEach(() => {
      installMockWebSocket();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      restoreMockWebSocket();
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

  describe('sendStream', () => {
    beforeEach(() => {
      installMockWebSocket();
    });

    afterEach(() => {
      restoreMockWebSocket();
    });

    /** Helper: connect a session and return it with its mock WebSocket */
    async function connectSession(options?: ConstructorParameters<typeof RealtimeSttSession>[3]) {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig, options);
      const connectPromise = session.connect();
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.open();
      await connectPromise;
      return { session, ws };
    }

    /** Helper: create an async generator from an array of chunks */
    async function* asyncChunks(chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it('should send all chunks from async iterable', async () => {
      const { session, ws } = await connectSession();
      const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5, 6])];

      await session.sendStream(asyncChunks(chunks));

      // ws.sent[0] is the config JSON message; audio chunks follow
      const sentAudio = ws.sent.slice(1);
      expect(sentAudio).toHaveLength(3);
      expect(new Uint8Array((sentAudio[0] as Uint8Array).buffer)).toEqual(new Uint8Array([1, 2]));
      expect(new Uint8Array((sentAudio[1] as Uint8Array).buffer)).toEqual(new Uint8Array([3, 4]));
      expect(new Uint8Array((sentAudio[2] as Uint8Array).buffer)).toEqual(new Uint8Array([5, 6]));
    });

    it('should call finish when finish option is true', async () => {
      const { session, ws } = await connectSession();
      const chunks = [new Uint8Array([1, 2])];

      const streamPromise = session.sendStream(asyncChunks(chunks), { finish: true });

      // Flush microtasks so the async generator completes and finish() is called
      await new Promise((r) => setImmediate(r));

      // Now finish() has been called; simulate server finished response so it resolves
      ws.message(
        JSON.stringify({
          tokens: [],
          final_audio_proc_ms: 0,
          total_audio_proc_ms: 0,
          finished: true,
        })
      );

      await streamPromise;

      expect(session.state).toBe('finished');
    });

    it('should not call finish by default', async () => {
      const { session } = await connectSession();
      const chunks = [new Uint8Array([1, 2])];

      await session.sendStream(asyncChunks(chunks));

      expect(session.state).toBe('connected');
    });

    it('should handle empty stream', async () => {
      const { session, ws } = await connectSession();

      await session.sendStream(asyncChunks([]));

      // Only the config message should have been sent
      expect(ws.sent).toHaveLength(1);
      expect(session.state).toBe('connected');
    });

    it('should throw StateError when not connected', async () => {
      const session = new RealtimeSttSession(mockApiKey, mockWsBaseUrl, mockConfig);
      const chunks = [new Uint8Array([1, 2])];

      await expect(session.sendStream(asyncChunks(chunks))).rejects.toThrow(StateError);
    });

    it('should throw AbortError when aborted mid-stream', async () => {
      const controller = new AbortController();
      const { session } = await connectSession({ signal: controller.signal });

      // Create a stream that aborts after the first chunk
      async function* abortingStream(): AsyncGenerator<Uint8Array> {
        yield new Uint8Array([1, 2]);
        controller.abort();
        yield new Uint8Array([3, 4]); // sendAudio should throw here
      }

      await expect(session.sendStream(abortingStream())).rejects.toThrow(AbortError);
    });

    it('should respect pace_ms option', async () => {
      jest.useFakeTimers();

      try {
        const { session, ws } = await connectSession();
        const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5, 6])];

        let resolved = false;
        const streamPromise = session.sendStream(asyncChunks(chunks), { pace_ms: 100 }).then(() => {
          resolved = true;
        });

        // First chunk is sent immediately
        await jest.advanceTimersByTimeAsync(0);
        const audioSent = () => ws.sent.slice(1);
        expect(audioSent()).toHaveLength(1);

        // After 100ms, second chunk should be sent
        await jest.advanceTimersByTimeAsync(100);
        expect(audioSent()).toHaveLength(2);

        // After another 100ms, third chunk should be sent
        await jest.advanceTimersByTimeAsync(100);
        expect(audioSent()).toHaveLength(3);

        // After final pace delay, promise resolves
        await jest.advanceTimersByTimeAsync(100);
        await streamPromise;
        expect(resolved).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('state_change and finished events', () => {
    beforeEach(() => {
      installMockWebSocket();
    });

    afterEach(() => {
      restoreMockWebSocket();
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
});
