import { Recording } from '../../src/recording';
import type { RecordingState, ReconnectingEvent } from '../../src/recording';
import type { AudioSource, AudioSourceHandlers } from '../../src/audio/types';
import type { ResolvedConnectionConfig, StateChangeReason } from '@soniox/core';

class MockAudioSource implements AudioSource {
  handlers: AudioSourceHandlers | null = null;
  started = false;
  stopped = false;
  paused = false;
  restartCount = 0;

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

  restart(): void {
    this.restartCount++;
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
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  binaryType = 'blob';
  sent: (string | Uint8Array)[] = [];
  private listeners = new Map<string, AnyFn[]>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
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

  send(data: string | Uint8Array) {
    this.sent.push(data);
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

  // Simulate error
  simulateError() {
    this.fire('error', new Event('error'));
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

function staticResolver(
  apiKey = 'temp:test-key',
  wsUrl = 'wss://test.example.com/transcribe-websocket',
  sessionDefaults: Record<string, unknown> = {}
): () => Promise<ResolvedConnectionConfig> {
  return async () => ({
    api_key: apiKey,
    api_domain: 'https://api.soniox.com',
    stt_ws_url: wsUrl,
    session_defaults: sessionDefaults,
  });
}

function delayedResolver(
  delayMs: number,
  apiKey = 'temp:delayed-key',
  wsUrl = 'wss://test.example.com/transcribe-websocket'
): () => Promise<ResolvedConnectionConfig> {
  return () =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            api_key: apiKey,
            api_domain: 'https://api.soniox.com',
            stt_ws_url: wsUrl,
            session_defaults: {},
          }),
        delayMs
      )
    );
}

function failingResolver(error: Error): () => Promise<ResolvedConnectionConfig> {
  return () => Promise.reject(error);
}

describe('Recording', () => {
  let source: MockAudioSource;

  beforeEach(() => {
    source = new MockAudioSource();
    MockWebSocket.instances = [];
  });

  it('transitions through starting -> connecting -> recording states', async () => {
    const states: string[] = [];

    const recording = new Recording(staticResolver(), { model: 'test' }, source, {
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
    const recording = new Recording(staticResolver(), { model: 'test' }, source);
    expect(recording.state).toBe('idle');
  });

  it('buffers audio during config resolution and connection', async () => {
    const recording = new Recording(delayedResolver(50), { model: 'test' }, source, { buffer_queue_size: 100 });

    // Wait for source to start
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(source.started).toBe(true);

    // Simulate audio data arriving while config is being resolved
    source.emitData(new ArrayBuffer(100));
    source.emitData(new ArrayBuffer(200));

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Recording should have progressed past buffering
    void recording;
  });

  it('emits error when audio source fails to start', async () => {
    const failingSource: AudioSource = {
      async start() {
        throw new Error('Mic access denied');
      },
      stop() {},
    };

    const errors: Error[] = [];
    const recording = new Recording(staticResolver(), { model: 'test' }, failingSource);

    recording.on('error', (err) => errors.push(err));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Mic access denied');
    expect(recording.state).toBe('error');
  });

  it('emits error when config resolution fails', async () => {
    const errors: Error[] = [];
    const recording = new Recording(failingResolver(new Error('Config fetch failed')), { model: 'test' }, source);

    recording.on('error', (err) => errors.push(err));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Config fetch failed');
    expect(recording.state).toBe('error');
  });

  it('cancel stops the source and transitions to canceled state', async () => {
    const recording = new Recording(staticResolver(), { model: 'test' }, source);

    // Wait for lifecycle to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    recording.cancel();

    expect(recording.state).toBe('canceled');
    expect(source.stopped).toBe(true);
  });

  it('cancel is safe to call multiple times', () => {
    const _recording = new Recording(staticResolver(), { model: 'test' }, source);
    _recording.cancel();
    _recording.cancel();
    expect(_recording.state).toBe('canceled');
  });

  // ---------------------------------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------------------------------

  describe('pause/resume', () => {
    async function createConnectedRecording() {
      const recording = new Recording(staticResolver(), { model: 'test' }, source, {
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
      const recording = new Recording(staticResolver(), { model: 'test' }, source);
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
      const recording = new Recording(staticResolver(), { model: 'test' }, source, {
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
      const recording = new Recording(staticResolver(), { model: 'test' }, source);
      const events: string[] = [];
      recording.on('source_muted', () => events.push('muted'));

      // Still starting — source_muted should be ignored
      source.emitMuted();
      expect(events).toEqual([]);
    });
  });

  describe('function-form session_config', () => {
    it('receives resolved config with session_defaults and returns sttConfig', async () => {
      const serverDefaults = { model: 'stt-rt-v5', language_hints: ['en'] };
      const configFn = jest.fn((resolved: ResolvedConnectionConfig) => ({
        ...resolved.session_defaults,
        enable_endpoint_detection: true,
      }));

      const resolver = staticResolver('temp:test-key', 'wss://test.example.com/transcribe-websocket', serverDefaults);
      const recording = new Recording(resolver, configFn, source);

      // Flush microtask queue so run() resolves config and calls the function
      await new Promise((r) => setTimeout(r, 0));

      expect(configFn).toHaveBeenCalledTimes(1);
      const arg = configFn.mock.calls[0][0];
      expect(arg.session_defaults).toEqual(serverDefaults);
      expect(arg.api_key).toBe('temp:test-key');

      void recording.stop();
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  describe('state_change reason', () => {
    it('emits reason on all state transitions', async () => {
      const changes: { state: RecordingState; reason?: StateChangeReason }[] = [];

      const recording = new Recording(staticResolver(), { model: 'test' }, source, {
        buffer_queue_size: 100,
      });

      recording.on('state_change', ({ new_state, reason }) => {
        changes.push({ state: new_state, reason });
      });

      await new Promise<void>((resolve) => {
        recording.on('state_change', ({ new_state }) => {
          if (new_state === 'recording') resolve();
        });
      });

      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: 'starting', reason: 'user_action' }),
          expect.objectContaining({ state: 'connecting', reason: 'user_action' }),
          expect.objectContaining({ state: 'recording', reason: 'connected' }),
        ])
      );

      recording.cancel();
      expect(changes[changes.length - 1]).toEqual(
        expect.objectContaining({ state: 'canceled', reason: 'user_action' })
      );
    });
  });

  describe('reconnection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function createConnectedRecording(
      opts: {
        auto_reconnect?: boolean;
        max_reconnect_attempts?: number;
        reconnect_base_delay_ms?: number;
        reset_transcript_on_reconnect?: boolean;
      } = {}
    ) {
      const recording = new Recording(staticResolver(), { model: 'test' }, source, {
        buffer_queue_size: 1000,
        auto_reconnect: opts.auto_reconnect ?? true,
        max_reconnect_attempts: opts.max_reconnect_attempts ?? 3,
        reconnect_base_delay_ms: opts.reconnect_base_delay_ms ?? 100,
        reset_transcript_on_reconnect: opts.reset_transcript_on_reconnect,
      });

      // Flush microtask (queueMicrotask in constructor)
      await jest.advanceTimersByTimeAsync(0);
      // Let WS open event fire (setTimeout in MockWebSocket constructor)
      await jest.advanceTimersByTimeAsync(0);
      // Let connect/recording state settle
      await jest.advanceTimersByTimeAsync(0);

      return recording;
    }

    async function flushReconnect(delayMs: number) {
      // Flush the backoff delay timer and all resulting async work
      // (config resolution, WS connection, post-connect logic).
      // advanceTimersByTimeAsync runs timers AND flushes microtasks,
      // but the reconnect flow has multiple async layers that each
      // schedule new timers. Repeat until the state settles.
      await jest.advanceTimersByTimeAsync(delayMs);
      // Keep advancing until all pending timers/microtasks settle.
      // Each pass flushes one layer of setTimeout(0) + microtasks.
      for (let i = 0; i < 20; i++) {
        await jest.advanceTimersByTimeAsync(1);
      }
    }

    it('reconnects on retriable error when auto_reconnect is true', async () => {
      const states: RecordingState[] = [];
      const recording = await createConnectedRecording();

      expect(recording.state).toBe('recording');
      recording.on('state_change', ({ new_state }) => states.push(new_state));

      MockWebSocket.instances[0]!.simulateClose('server_crash');

      expect(recording.state).toBe('reconnecting');

      await flushReconnect(100);

      expect(MockWebSocket.instances.length).toBe(2);
      expect(recording.state).toBe('recording');
      expect(states).toContain('reconnecting');
      expect(states).toContain('connecting');
      expect(states).toContain('recording');
    });

    it('does not reconnect when auto_reconnect is false', async () => {
      const recording = new Recording(staticResolver(), { model: 'test' }, source, {
        buffer_queue_size: 100,
        auto_reconnect: false,
      });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);

      expect(recording.state).toBe('recording');

      const ws = MockWebSocket.instances[0]!;
      ws.simulateClose('server_crash');

      expect(recording.state).toBe('error');
    });

    it('does not reconnect on non-retriable error (AuthError)', async () => {
      const recording = await createConnectedRecording();

      const ws = MockWebSocket.instances[0]!;
      ws.simulateMessage(JSON.stringify({ error_code: 401, error_message: 'Invalid API key' }));

      expect(recording.state).toBe('error');
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('attempt counter resets after successful reconnect', async () => {
      const recording = await createConnectedRecording({
        max_reconnect_attempts: 2,
        reconnect_base_delay_ms: 50,
      });

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');
      await flushReconnect(50);
      expect(recording.state).toBe('recording');

      MockWebSocket.instances[1]!.simulateClose();
      expect(recording.state).toBe('reconnecting');
      await flushReconnect(50);
      expect(recording.state).toBe('recording');
    });

    it('emits reconnecting and reconnected events', async () => {
      const reconnectingEvents: ReconnectingEvent[] = [];
      const reconnectedEvents: { attempt: number }[] = [];
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      recording.on('reconnecting', (evt) => reconnectingEvents.push({ ...evt }));
      recording.on('reconnected', (evt) => reconnectedEvents.push(evt));

      MockWebSocket.instances[0]!.simulateClose();
      await flushReconnect(50);

      expect(reconnectingEvents).toHaveLength(1);
      expect(reconnectingEvents[0]!.attempt).toBe(1);
      expect(reconnectingEvents[0]!.max_attempts).toBe(3);
      expect(reconnectingEvents[0]!.delay_ms).toBe(50);

      expect(reconnectedEvents).toHaveLength(1);
      expect(reconnectedEvents[0]!.attempt).toBe(1);
    });

    it('preventDefault() in reconnecting event cancels reconnect', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      recording.on('reconnecting', (evt) => evt.preventDefault());

      const errors: Error[] = [];
      recording.on('error', (err) => errors.push(err));

      MockWebSocket.instances[0]!.simulateClose();

      expect(recording.state).toBe('error');
      expect(errors).toHaveLength(1);
      expect(source.stopped).toBe(true);
    });

    it('emits session_restart before connected on reconnect', async () => {
      const events: string[] = [];
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      recording.on('session_restart', () => events.push('session_restart'));
      recording.on('connected', () => events.push('connected'));
      recording.on('reconnected', () => events.push('reconnected'));

      MockWebSocket.instances[0]!.simulateClose();
      await flushReconnect(50);

      expect(events[0]).toBe('session_restart');
      expect(events).toContain('connected');
      expect(events).toContain('reconnected');
    });

    it('discards buffered audio on reconnect and restarts source encoder', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      source.emitData(new ArrayBuffer(10));
      source.emitData(new ArrayBuffer(20));

      await flushReconnect(50);

      expect(recording.state).toBe('recording');
      // Stale buffer audio must NOT be sent to the new session —
      // it lacks the container header the server needs.
      const ws2 = MockWebSocket.instances[1]!;
      const audioSent = ws2.sent.filter((d) => d instanceof Uint8Array);
      expect(audioSent.length).toBe(0);
      // Source encoder should have been restarted.
      expect(source.restartCount).toBe(1);
    });

    it('preserves paused state across reconnect', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      recording.pause();
      expect(recording.state).toBe('paused');

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      source.emitData(new ArrayBuffer(10));

      await flushReconnect(50);

      expect(recording.state).toBe('paused');
      expect(source.restartCount).toBe(1);
      expect(source.paused).toBe(true);

      const ws2 = MockWebSocket.instances[1]!;
      const audioSent = ws2.sent.filter((d) => d instanceof Uint8Array);
      expect(audioSent.length).toBe(0);

      recording.resume();
      expect(recording.state).toBe('recording');
      // Old buffer was discarded (stale encoder data); no audio
      // should have been sent to the new session yet.
      const audioAfterResume = ws2.sent.filter((d) => d instanceof Uint8Array);
      expect(audioAfterResume.length).toBe(0);
    });

    it('preserves mute state across reconnect', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      source.emitMuted();

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      await flushReconnect(50);

      expect(recording.state).toBe('recording');
    });

    it('uses exponential backoff for reconnect delays', async () => {
      const delays: number[] = [];
      const recording = await createConnectedRecording({
        max_reconnect_attempts: 3,
        reconnect_base_delay_ms: 100,
      });

      recording.on('reconnecting', (evt) => delays.push(evt.delay_ms));

      MockWebSocket.instances[0]!.simulateClose();

      expect(delays[0]).toBe(100);
    });

    it('state_change events include reconnect-related reasons', async () => {
      const changes: { state: RecordingState; reason?: StateChangeReason }[] = [];
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 50 });

      recording.on('state_change', ({ new_state, reason }) => {
        changes.push({ state: new_state, reason });
      });

      MockWebSocket.instances[0]!.simulateClose();
      await flushReconnect(50);

      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: 'reconnecting', reason: 'connection_lost' }),
          expect.objectContaining({ state: 'connecting', reason: 'reconnecting' }),
          expect.objectContaining({ state: 'recording', reason: 'reconnected' }),
        ])
      );
    });

    it('stop() during backoff aborts reconnect and resolves', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 500 });
      expect(recording.state).toBe('recording');

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      // Call stop while the backoff delay is still pending.
      const stopPromise = recording.stop();
      expect(recording.state).toBe('stopping');

      // Advance past the backoff — reconnect should detect stopping and
      // settle the stop promise instead of creating a new session.
      await flushReconnect(500);

      await stopPromise;
      expect(recording.state).toBe('stopped');
      // No second WebSocket should have been created.
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('stop() during reconnect connecting phase aborts and resolves', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 10 });

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      // Advance past backoff so reconnect proceeds to config + connect.
      await jest.advanceTimersByTimeAsync(10);
      // Advance to let config resolve.
      await jest.advanceTimersByTimeAsync(1);

      // Recording should be connecting now.
      if (recording.state === 'connecting') {
        const stopPromise = recording.stop();
        // Advance to let the WS open and the check point fire.
        await flushReconnect(0);
        await stopPromise;
        expect(recording.state).toBe('stopped');
      }
    });

    it('mute change during backoff is reflected on new session', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 200 });
      expect(recording.state).toBe('recording');

      // Drop connection while unmuted.
      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      // Hardware mute arrives during the backoff window.
      source.emitMuted();

      await flushReconnect(200);

      expect(recording.state).toBe('recording');
      // The new session should be paused (keepalive mode) because the
      // source was muted during the backoff. Advance past the keepalive
      // interval (default 5000ms) so the first keepalive message fires.
      await jest.advanceTimersByTimeAsync(6000);
      const ws2 = MockWebSocket.instances[1]!;
      const messages = ws2.sent.filter((d) => typeof d === 'string');
      const hasPause = messages.some((m) => {
        try {
          return JSON.parse(m).type === 'keepalive';
        } catch {
          return false;
        }
      });
      expect(hasPause).toBe(true);
    });

    it('unmute during reconnect is picked up at restoration time', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 200 });

      // Mute before disconnect.
      source.emitMuted();

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      // Unmute during backoff.
      source.emitUnmuted();

      await flushReconnect(200);

      expect(recording.state).toBe('recording');
      // Session should NOT be paused because the source was unmuted
      // before the new session was created.
      const ws2 = MockWebSocket.instances[1]!;
      const messages = ws2.sent.filter((d) => typeof d === 'string');
      const hasPause = messages.some((m) => {
        try {
          return JSON.parse(m).type === 'keepalive';
        } catch {
          return false;
        }
      });
      expect(hasPause).toBe(false);
    });

    it('mute events during reconnecting update isSourceMuted', async () => {
      const recording = await createConnectedRecording({ reconnect_base_delay_ms: 200 });
      const muteEvents: string[] = [];

      recording.on('source_muted', () => muteEvents.push('muted'));
      recording.on('source_unmuted', () => muteEvents.push('unmuted'));

      MockWebSocket.instances[0]!.simulateClose();
      expect(recording.state).toBe('reconnecting');

      source.emitMuted();
      expect(muteEvents).toContain('muted');

      source.emitUnmuted();
      expect(muteEvents).toContain('unmuted');
    });
  });
});
