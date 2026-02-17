import { Recording } from '../../src/recording';
import type { AudioSource, AudioSourceHandlers } from '../../src/audio/types';

class MockAudioSource implements AudioSource {
  handlers: AudioSourceHandlers | null = null;
  started = false;
  stopped = false;

  async start(handlers: AudioSourceHandlers): Promise<void> {
    this.handlers = handlers;
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  /** Simulate sending audio data */
  emitData(chunk: ArrayBuffer): void {
    this.handlers?.onData(chunk);
  }

  /** Simulate an error */
  emitError(error: Error): void {
    this.handlers?.onError(error);
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
});
