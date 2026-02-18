import { Recording } from '../../src/recording';
import type { AudioSource, AudioSourceHandlers } from '../../src/audio/types';

class MockAudioSource implements AudioSource {
  handlers: AudioSourceHandlers | null = null;
  started = false;
  stopped = false;
  paused = false;

  async start(handlers: AudioSourceHandlers): Promise<void> {
    this.handlers = handlers;
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Simulate sending audio data */
  emitData(chunk: ArrayBuffer): void {
    this.handlers?.onData(chunk);
  }

  /** Simulate an error */
  emitError(error: Error): void {
    this.handlers?.onError(error);
  }

  /** Simulate external mute */
  emitMuted(): void {
    this.handlers?.onMuted?.();
  }

  /** Simulate external unmute */
  emitUnmuted(): void {
    this.handlers?.onUnmuted?.();
  }
}

type AnyFn = (...args: unknown[]) => unknown;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.OPEN;
  binaryType = 'blob';
  private listeners = new Map<string, AnyFn[]>();

  constructor(url: string) {
    this.url = url;
    // Simulate async open
    setTimeout(() => {
      this.fire('open', new Event('open'));
    }, 0);
  }

  addEventListener(event: string, handler: AnyFn) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  removeEventListener(event: string, handler: AnyFn) {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((h) => h !== handler)
    );
  }

  send(_data: string | Uint8Array) {
    // No-op for tests
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Simulate server sending a message
  simulateMessage(data: string) {
    this.fire('message', { data } as MessageEvent);
  }

  // Simulate close
  simulateClose(reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.fire('close', { reason } as CloseEvent);
  }

  private fire(event: string, payload: unknown) {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(payload);
    }
  }
}

// Install mock WebSocket globally
(globalThis as any).WebSocket = MockWebSocket;

describe('Recording', () => {
  let source: MockAudioSource;

  beforeEach(() => {
    source = new MockAudioSource();
  });

  it('transitions through starting -> connecting -> recording states', async () => {
    const states: string[] = [];

    const recording = new Recording('temp:test-key', 'wss://test.example.com', { model: 'test' }, source, {
      buffer_queue_size: 100,
    });

    recording.on('state_change', ({ new_state }) => {
      states.push(new_state);
    });

    // Wait for the async lifecycle to progress
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(states).toContain('starting');
    expect(states).toContain('connecting');
    expect(source.started).toBe(true);
  });

  it('starts with idle state', () => {
    const recording = new Recording('temp:key', 'wss://test.example.com', { model: 'test' }, source);
    expect(recording.state).toBe('idle');
  });

  it('buffers audio during key fetch and connection', async () => {
    let resolveKey: (key: string) => void;
    const keyPromise = new Promise<string>((resolve) => {
      resolveKey = resolve;
    });

    // Recording is created just for its side effect of starting the source
    new Recording(() => keyPromise, 'wss://test.example.com', { model: 'test' }, source, { buffer_queue_size: 100 });

    // Wait for source to start
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(source.started).toBe(true);

    // Simulate audio data arriving while key is being fetched
    source.emitData(new ArrayBuffer(100));
    source.emitData(new ArrayBuffer(200));

    // Resolve the key
    resolveKey!('temp:resolved-key');

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('emits error when audio source fails to start', async () => {
    const failingSource: AudioSource = {
      async start() {
        throw new Error('Mic access denied');
      },
      stop() {},
    };

    const errors: Error[] = [];
    const recording = new Recording('temp:key', 'wss://test.example.com', { model: 'test' }, failingSource);

    recording.on('error', (err) => errors.push(err));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Mic access denied');
    expect(recording.state).toBe('error');
  });

  it('emits error when api key resolution fails', async () => {
    const errors: Error[] = [];
    const recording = new Recording(
      () => Promise.reject(new Error('Key fetch failed')),
      'wss://test.example.com',
      { model: 'test' },
      source
    );

    recording.on('error', (err) => errors.push(err));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Key fetch failed');
    expect(recording.state).toBe('error');
  });

  it('cancel stops the source and transitions to canceled state', async () => {
    const recording = new Recording('temp:key', 'wss://test.example.com', { model: 'test' }, source);

    // Wait for lifecycle to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    recording.cancel();

    expect(recording.state).toBe('canceled');
    expect(source.stopped).toBe(true);
  });

  it('cancel is safe to call multiple times', () => {
    const _recording = new Recording('temp:key', 'wss://test.example.com', { model: 'test' }, source);
    _recording.cancel();
    _recording.cancel();
    expect(_recording.state).toBe('canceled');
  });

  // ---------------------------------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------------------------------

  describe('pause/resume', () => {
    async function createConnectedRecording() {
      const recording = new Recording('temp:test-key', 'wss://test.example.com', { model: 'test' }, source, {
        buffer_queue_size: 100,
      });

      // Wait for lifecycle to reach 'recording'
      await new Promise<void>((resolve) => {
        recording.on('state_change', ({ new_state }) => {
          if (new_state === 'recording') resolve();
        });
      });

      return recording;
    }

    it('pause() from recording transitions to paused', async () => {
      const recording = await createConnectedRecording();
      recording.pause();
      expect(recording.state).toBe('paused');
      expect(source.paused).toBe(true);
    });

    it('resume() from paused transitions back to recording', async () => {
      const recording = await createConnectedRecording();
      recording.pause();
      recording.resume();
      expect(recording.state).toBe('recording');
      expect(source.paused).toBe(false);
    });

    it('pause() from non-recording states is a no-op', async () => {
      const recording = new Recording('temp:key', 'wss://test.example.com', { model: 'test' }, source);
      // Still idle/starting
      recording.pause();
      expect(recording.state).not.toBe('paused');
    });

    it('resume() from non-paused states is a no-op', async () => {
      const recording = await createConnectedRecording();
      expect(recording.state).toBe('recording');
      recording.resume();
      expect(recording.state).toBe('recording');
    });

    it('stop() from paused completes without bouncing through recording state', async () => {
      const recording = await createConnectedRecording();
      recording.pause();
      expect(recording.state).toBe('paused');

      const states: string[] = [];
      recording.on('state_change', ({ new_state }) => {
        states.push(new_state);
      });

      const stopPromise = recording.stop();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // If session finished fires, stop resolves
      await Promise.race([stopPromise, new Promise((resolve) => setTimeout(resolve, 100))]);

      expect(states).not.toContain('recording');
      expect(states).toContain('stopping');
    });

    it('cancel() from paused works correctly', async () => {
      const recording = await createConnectedRecording();
      recording.pause();
      recording.cancel();
      expect(recording.state).toBe('canceled');
      expect(source.stopped).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Source mute events
  // ---------------------------------------------------------------------------

  describe('source mute events', () => {
    async function createConnectedRecording() {
      const recording = new Recording('temp:test-key', 'wss://test.example.com', { model: 'test' }, source, {
        buffer_queue_size: 100,
      });

      await new Promise<void>((resolve) => {
        recording.on('state_change', ({ new_state }) => {
          if (new_state === 'recording') resolve();
        });
      });

      return recording;
    }

    it('emits source_muted when source reports mute', async () => {
      const recording = await createConnectedRecording();
      const events: string[] = [];
      recording.on('source_muted', () => events.push('muted'));

      source.emitMuted();
      expect(events).toEqual(['muted']);
    });

    it('emits source_unmuted when source reports unmute', async () => {
      const recording = await createConnectedRecording();
      const events: string[] = [];
      recording.on('source_unmuted', () => events.push('unmuted'));

      source.emitMuted();
      source.emitUnmuted();
      expect(events).toEqual(['unmuted']);
    });

    it('mute/unmute events still fire while paused', async () => {
      const recording = await createConnectedRecording();
      const events: string[] = [];
      recording.on('source_muted', () => events.push('muted'));
      recording.on('source_unmuted', () => events.push('unmuted'));

      recording.pause();
      source.emitMuted();
      source.emitUnmuted();
      expect(events).toEqual(['muted', 'unmuted']);
    });

    it('resume() keeps session paused when source is still muted', async () => {
      const recording = await createConnectedRecording();

      source.emitMuted();
      recording.pause();
      // Source is muted, user paused — both conditions hold.
      recording.resume();
      // State is recording, but session should remain paused because
      // the source is still muted (no audio flows).
      expect(recording.state).toBe('recording');
      // Unmuting the source should now resume the session.
      source.emitUnmuted();
    });

    it('resume() resumes session normally when source is not muted', async () => {
      const recording = await createConnectedRecording();

      recording.pause();
      recording.resume();
      expect(recording.state).toBe('recording');
    });

    it('late source_unmuted during/after stop() does not emit or resume', async () => {
      const recording = await createConnectedRecording();
      const events: string[] = [];
      recording.on('source_unmuted', () => events.push('unmuted'));

      source.emitMuted();
      void recording.stop();
      source.emitUnmuted();
      expect(events).toEqual([]);
    });

    it('source_muted is ignored in non-recording states', () => {
      const recording = new Recording('temp:key', 'wss://test.example.com', { model: 'test' }, source);
      const events: string[] = [];
      recording.on('source_muted', () => events.push('muted'));

      // Still starting — source_muted should be ignored
      source.emitMuted();
      expect(events).toEqual([]);
    });
  });
});
