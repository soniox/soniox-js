import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SonioxClient } from '@soniox/client';
import type { AudioSource, AudioSourceHandlers, RealtimeResult } from '@soniox/client';
import { SonioxProvider, useRecording } from '../../src';

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(')) {
      return;
    }
    originalConsoleError(...args);
  };
});
afterAll(() => {
  console.error = originalConsoleError;
});

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

  emitData(chunk: ArrayBuffer): void {
    this.handlers?.onData(chunk);
  }

  emitError(error: Error): void {
    this.handlers?.onError(error);
  }

  emitMuted(): void {
    this.handlers?.onMuted?.();
  }

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
    // No-op
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateMessage(data: string) {
    this.fire('message', { data } as MessageEvent);
  }

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

(globalThis as any).WebSocket = MockWebSocket;

function createWrapper() {
  const client = new SonioxClient({ api_key: 'temp:test-key' });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { client }, children);
  return { client, wrapper };
}

function _makeResult(tokens: Array<{ text: string; is_final: boolean }>): RealtimeResult {
  return {
    tokens: tokens.map((t) => ({
      text: t.text,
      confidence: 1,
      is_final: t.is_final,
      start_ms: 0,
      end_ms: 100,
    })),
    final_audio_proc_ms: 100,
    total_audio_proc_ms: 200,
  };
}

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useRecording', () => {
  it('starts in idle state', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRecording({ model: 'test' }), { wrapper });

    expect(result.current.state).toBe('idle');
    expect(result.current.isActive).toBe(false);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.text).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('transitions to starting when start() is called', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    // Should be at least past idle
    expect(result.current.state).not.toBe('idle');
    expect(result.current.isActive).toBe(true);
  });

  it('cancel() transitions to canceled state', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(10);
    });

    await act(async () => {
      result.current.cancel();
      await tick(10);
    });

    expect(result.current.state).toBe('canceled');
    expect(result.current.isActive).toBe(false);
  });

  it('stop() is safe to call when idle', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecording({ model: 'test' }), { wrapper });

    // Should not throw
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.state).toBe('idle');
  });

  it('cancel() is safe to call when idle', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecording({ model: 'test' }), { wrapper });

    // Should not throw
    act(() => {
      result.current.cancel();
    });

    expect(result.current.state).toBe('idle');
  });

  it('start() aborts any previous in-flight recording', async () => {
    const { wrapper } = createWrapper();
    const source1 = new MockAudioSource();
    const source2 = new MockAudioSource();
    const _callCount = 0;

    const { result, rerender } = renderHook(
      ({ source }: { source: MockAudioSource }) => useRecording({ model: 'test', source }),
      { wrapper, initialProps: { source: source1 } }
    );

    // Start first recording
    await act(async () => {
      result.current.start();
      await tick(10);
    });

    const firstState = result.current.state;
    expect(firstState).not.toBe('idle');

    // Start second recording with different source
    rerender({ source: source2 });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    // First recording should have been aborted, second should be active
    expect(result.current.isActive).toBe(true);
  });

  it('surfaces errors in the error field', async () => {
    const { wrapper } = createWrapper();

    const failingSource: AudioSource = {
      async start() {
        throw new Error('Mic access denied');
      },
      stop() {},
    };

    const { result } = renderHook(() => useRecording({ model: 'test', source: failingSource }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toBe('Mic access denied');
  });

  it('resets transcript on start() by default', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    // Start, get some data, then cancel
    await act(async () => {
      result.current.start();
      await tick(50);
    });

    await act(async () => {
      result.current.cancel();
      await tick(10);
    });

    // Start again — text should be reset
    act(() => {
      result.current.start();
    });

    expect(result.current.text).toBe('');
    expect(result.current.finalText).toBe('');
    expect(result.current.partialText).toBe('');
  });

  it('preserves state when resetOnStart is false', async () => {
    const { wrapper } = createWrapper();

    // Use a failing source to produce an observable error in the store.
    // Error is a field that store.reset() clears, so it serves as a
    // reliable indicator of whether reset() was called.
    const failingSource: AudioSource = {
      async start() {
        throw new Error('test-error-preserve');
      },
      stop() {},
    };

    const { result } = renderHook(() => useRecording({ model: 'test', source: failingSource, resetOnStart: false }), {
      wrapper,
    });

    // First start → source fails, error is set.
    await act(async () => {
      result.current.start();
      await tick(50);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toBe('test-error-preserve');

    // Second start with resetOnStart: false → reset() is NOT called,
    // so the error from the previous recording persists at this instant.
    act(() => {
      result.current.start();
    });

    // Error should still be present (not cleared by reset).
    expect(result.current.error!.message).toBe('test-error-preserve');

    // Wait for the second recording to also fail with the same error.
    await act(async () => {
      await tick(50);
    });

    expect(result.current.error!.message).toBe('test-error-preserve');
  });

  it('clears state when resetOnStart is true (default)', async () => {
    const { wrapper } = createWrapper();

    const failingSource: AudioSource = {
      async start() {
        throw new Error('test-error-clear');
      },
      stop() {},
    };

    const { result } = renderHook(() => useRecording({ model: 'test', source: failingSource }), { wrapper });

    // First start → fails, error is set.
    await act(async () => {
      result.current.start();
      await tick(50);
    });

    expect(result.current.error!.message).toBe('test-error-clear');

    // Second start with resetOnStart: true (default) → reset() IS called,
    // so the error is cleared before the new recording starts.
    act(() => {
      result.current.start();
    });

    // Error should be null right after start (cleared by reset).
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe('idle'); // reset sets state to idle before recording begins
  });

  it('clearTranscript() resets text fields but not state', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    const stateBeforeClear = result.current.state;

    act(() => {
      result.current.clearTranscript();
    });

    // State should be preserved
    expect(result.current.state).toBe(stateBeforeClear);
    expect(result.current.text).toBe('');
    expect(result.current.finalText).toBe('');
    expect(result.current.partialText).toBe('');
    expect(result.current.utterances).toEqual([]);
    expect(result.current.segments).toEqual([]);
  });

  it('fires onError callback without stale closure', async () => {
    const { wrapper } = createWrapper();
    const errors: string[] = [];

    const failingSource: AudioSource = {
      async start() {
        throw new Error('fail');
      },
      stop() {},
    };

    // Initial callback
    const { result, rerender } = renderHook(
      ({ cb }: { cb: (e: Error) => void }) => useRecording({ model: 'test', source: failingSource, onError: cb }),
      {
        wrapper,
        initialProps: { cb: (e: Error) => errors.push('v1:' + e.message) },
      }
    );

    // Update callback before start
    rerender({ cb: (e: Error) => errors.push('v2:' + e.message) });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    // Should call v2, not v1 (no stale closure)
    expect(errors).toContain('v2:fail');
    expect(errors).not.toContain('v1:fail');
  });

  it('cleans up on unmount via AbortSignal', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result, unmount } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(10);
    });

    // Unmount should abort without throwing; wrap in act() so the
    // async teardown state-updates are processed by React.
    await act(async () => {
      unmount();
      await tick(10);
    });

    expect(source.stopped).toBe(true);
  });

  it('getServerSnapshot returns idle state (SSR safety)', async () => {
    // RecordingStore's getServerSnapshot should return idle
    const { RecordingStore } = await import('../../src/store');
    const store = new RecordingStore();
    const snapshot = store.getServerSnapshot();

    expect(snapshot.state).toBe('idle');
    expect(snapshot.isActive).toBe(false);
    expect(snapshot.text).toBe('');
  });

  it('isSupported reflects platform capabilities', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRecording({ model: 'test' }), { wrapper });

    // In jsdom, navigator.mediaDevices may or may not exist
    expect(typeof result.current.isSupported).toBe('boolean');
    expect(result.current.unsupportedReason === undefined || typeof result.current.unsupportedReason === 'string').toBe(
      true
    );
  });

  it('returns stable function references across renders', () => {
    const { wrapper } = createWrapper();
    const { result, rerender } = renderHook(() => useRecording({ model: 'test' }), { wrapper });

    const first = {
      start: result.current.start,
      stop: result.current.stop,
      cancel: result.current.cancel,
      pause: result.current.pause,
      resume: result.current.resume,
      finalize: result.current.finalize,
      clearTranscript: result.current.clearTranscript,
    };

    rerender();

    expect(result.current.start).toBe(first.start);
    expect(result.current.stop).toBe(first.stop);
    expect(result.current.cancel).toBe(first.cancel);
    expect(result.current.pause).toBe(first.pause);
    expect(result.current.resume).toBe(first.resume);
    expect(result.current.finalize).toBe(first.finalize);
    expect(result.current.clearTranscript).toBe(first.clearTranscript);
  });
});

// =============================================================================
// RecordingStore: partialTokens, groups
// =============================================================================

describe('RecordingStore token accumulation', () => {
  let RecordingStoreClass: typeof import('../../src/store').RecordingStore;

  beforeAll(async () => {
    const mod = await import('../../src/store');
    RecordingStoreClass = mod.RecordingStore;
  });

  function makeResult(
    tokens: Array<{ text: string; is_final: boolean; translation_status?: string; language?: string; speaker?: string }>
  ): RealtimeResult {
    return {
      tokens: tokens.map((t) => ({
        text: t.text,
        confidence: 1,
        is_final: t.is_final,
        start_ms: 0,
        end_ms: 100,
        ...(t.translation_status !== undefined ? { translation_status: t.translation_status } : {}),
        ...(t.language !== undefined ? { language: t.language } : {}),
        ...(t.speaker !== undefined ? { speaker: t.speaker } : {}),
      })),
      final_audio_proc_ms: 100,
      total_audio_proc_ms: 200,
    };
  }

  function attachMock(store: InstanceType<typeof RecordingStoreClass>) {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const mockRecording = {
      on(event: string, handler: (...args: any[]) => void) {
        (listeners[event] ??= []).push(handler);
      },
      off() {},
    } as any;
    store.attach(mockRecording);
    return listeners;
  }

  it('partialTokens reflects only latest result non-finals', () => {
    const store = new RecordingStoreClass();
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) handler(makeResult([{ text: 'Hel', is_final: false }]));
    expect(store.getSnapshot().partialTokens).toHaveLength(1);

    for (const handler of listeners['result']!) handler(makeResult([{ text: 'Hello', is_final: false }]));
    const snap = store.getSnapshot();
    expect(snap.partialTokens).toHaveLength(1);
    expect(snap.partialTokens[0].text).toBe('Hello');
  });

  it('endpoint clears partialTokens', () => {
    const store = new RecordingStoreClass();
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Hello', is_final: true },
          { text: ' wor', is_final: false },
        ])
      );
    }
    expect(store.getSnapshot().partialTokens).toHaveLength(1);

    for (const handler of listeners['endpoint']!) handler();
    expect(store.getSnapshot().partialTokens).toHaveLength(0);
  });

  it('finished clears partialTokens', () => {
    const store = new RecordingStoreClass();
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Hello', is_final: true },
          { text: ' world', is_final: false },
        ])
      );
    }
    expect(store.getSnapshot().partialTokens).toHaveLength(1);

    for (const handler of listeners['finished']!) handler();
    expect(store.getSnapshot().partialTokens).toHaveLength(0);
  });

  it('reset clears all token and group state', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => token.language ?? 'unknown');
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(makeResult([{ text: 'Hello', is_final: true, language: 'en' }]));
    }
    expect(store.getSnapshot().groups.en).toBeDefined();

    store.reset();
    const snap = store.getSnapshot();
    expect(snap.partialTokens).toHaveLength(0);
    expect(snap.groups).toEqual({});
  });

  it('groups auto-populates with translation keys for one_way groupBy', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => (token.translation_status === 'translation' ? 'translation' : 'original'));
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Hello', is_final: true, translation_status: 'original', language: 'en' },
          { text: 'Hola', is_final: true, translation_status: 'translation', language: 'es' },
          { text: ' wor', is_final: false, translation_status: 'original', language: 'en' },
        ])
      );
    }

    const snap = store.getSnapshot();
    expect(snap.groups.original).toBeDefined();
    expect(snap.groups.translation).toBeDefined();

    expect(snap.groups.original.finalText).toBe('Hello');
    expect(snap.groups.original.partialText).toBe(' wor');
    expect(snap.groups.original.text).toBe('Hello wor');
    expect(snap.groups.original.partialTokens).toHaveLength(1);

    expect(snap.groups.translation.finalText).toBe('Hola');
    expect(snap.groups.translation.partialText).toBe('');
    expect(snap.groups.translation.text).toBe('Hola');
    expect(snap.groups.translation.partialTokens).toHaveLength(0);
  });

  it('groups accumulates finalText across multiple results', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => (token.translation_status === 'translation' ? 'translation' : 'original'));
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(makeResult([{ text: 'Hello ', is_final: true, translation_status: 'original' }]));
    }
    for (const handler of listeners['result']!) {
      handler(makeResult([{ text: 'world', is_final: true, translation_status: 'original' }]));
    }

    const snap = store.getSnapshot();
    expect(snap.groups.original.finalText).toBe('Hello world');
    expect(snap.groups.original.text).toBe('Hello world');
  });

  it('groups auto-populates with language keys for two_way groupBy', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => token.language ?? 'unknown');
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Good ', is_final: true, translation_status: 'original', language: 'en' },
          { text: 'morning', is_final: false, translation_status: 'original', language: 'en' },
          { text: 'Guten ', is_final: true, translation_status: 'translation', language: 'de' },
          { text: 'Morgen', is_final: false, translation_status: 'translation', language: 'de' },
        ])
      );
    }

    const snap = store.getSnapshot();
    expect(snap.groups.en.text).toBe('Good morning');
    expect(snap.groups.en.finalText).toBe('Good ');
    expect(snap.groups.en.partialText).toBe('morning');

    expect(snap.groups.de.text).toBe('Guten Morgen');
    expect(snap.groups.de.finalText).toBe('Guten ');
    expect(snap.groups.de.partialText).toBe('Morgen');
  });

  it('groups is empty when no groupBy is set', () => {
    const store = new RecordingStoreClass();
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) handler(makeResult([{ text: 'Hello', is_final: true }]));
    expect(store.getSnapshot().groups).toEqual({});
  });

  it('endpoint moves partial text to finalText in groups', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => token.language ?? 'unknown');
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Hello', is_final: true, language: 'en' },
          { text: ' world', is_final: false, language: 'en' },
        ])
      );
    }
    expect(store.getSnapshot().groups.en.partialTokens).toHaveLength(1);

    for (const handler of listeners['endpoint']!) handler();

    expect(store.getSnapshot().groups.en.partialTokens).toHaveLength(0);
    expect(store.getSnapshot().groups.en.partialText).toBe('');
    expect(store.getSnapshot().groups.en.finalText).toBe('Hello world');
  });

  it('finished moves partial text to finalText in groups', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => (token.translation_status === 'translation' ? 'translation' : 'original'));
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Hi', is_final: false, translation_status: 'original' },
          { text: 'Hola', is_final: false, translation_status: 'translation' },
        ])
      );
    }

    for (const handler of listeners['finished']!) handler();

    const snap = store.getSnapshot();
    expect(snap.groups.original.partialTokens).toHaveLength(0);
    expect(snap.groups.original.finalText).toBe('Hi');
    expect(snap.groups.translation.partialTokens).toHaveLength(0);
    expect(snap.groups.translation.finalText).toBe('Hola');
  });

  it('groupBy speaker works', () => {
    const store = new RecordingStoreClass();
    store.setGroupBy((token) => token.speaker ?? 'unknown');
    const listeners = attachMock(store);

    for (const handler of listeners['result']!) {
      handler(
        makeResult([
          { text: 'Hello', is_final: true, speaker: 'speaker_0' },
          { text: 'Hi', is_final: true, speaker: 'speaker_1' },
        ])
      );
    }

    const snap = store.getSnapshot();
    expect(snap.groups.speaker_0.text).toBe('Hello');
    expect(snap.groups.speaker_1.text).toBe('Hi');
  });

  it('SSR snapshot includes empty groups and partialTokens', () => {
    const store = new RecordingStoreClass();
    const snap = store.getServerSnapshot();

    expect(snap.partialTokens).toEqual([]);
    expect(snap.groups).toEqual({});
  });
});

describe('useRecording standalone (no Provider)', () => {
  it('works with apiKey prop and no SonioxProvider', () => {
    const { result } = renderHook(() => useRecording({ apiKey: 'temp:test-key', model: 'test' }));

    expect(result.current.state).toBe('idle');
    expect(result.current.isActive).toBe(false);
    expect(result.current.text).toBe('');
  });

  it('throws when neither Provider nor apiKey is present', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useRecording({ model: 'test' }));
    }).toThrow('useRecording requires either a <SonioxProvider> ancestor or an `apiKey` prop');

    errorSpy.mockRestore();
  });

  it('prefers Provider client over inline apiKey', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecording({ apiKey: 'temp:other-key', model: 'test' }), { wrapper });

    // Should work — Provider client takes precedence.
    expect(result.current.state).toBe('idle');
  });
});

// =============================================================================
// Pause / Resume
// =============================================================================

describe('useRecording pause/resume', () => {
  it('pause() transitions isPaused to true and state to paused', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    expect(result.current.state).toBe('recording');
    expect(result.current.isPaused).toBe(false);

    await act(async () => {
      result.current.pause();
      await tick(10);
    });

    expect(result.current.state).toBe('paused');
    expect(result.current.isPaused).toBe(true);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isActive).toBe(true);
  });

  it('resume() transitions back to recording', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    await act(async () => {
      result.current.pause();
      await tick(10);
    });

    expect(result.current.isPaused).toBe(true);

    await act(async () => {
      result.current.resume();
      await tick(10);
    });

    expect(result.current.state).toBe('recording');
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isRecording).toBe(true);
  });

  it('pause() is a no-op when not recording', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecording({ model: 'test' }), { wrapper });

    act(() => {
      result.current.pause();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.isPaused).toBe(false);
  });
});

// =============================================================================
// Source mute detection
// =============================================================================

describe('useRecording source mute', () => {
  it('isSourceMuted updates when source_muted / source_unmuted fire', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source }), { wrapper });

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    expect(result.current.isSourceMuted).toBe(false);

    await act(async () => {
      source.emitMuted();
      await tick(10);
    });

    expect(result.current.isSourceMuted).toBe(true);

    await act(async () => {
      source.emitUnmuted();
      await tick(10);
    });

    expect(result.current.isSourceMuted).toBe(false);
  });

  it('onSourceMuted / onSourceUnmuted callbacks are invoked', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();
    const events: string[] = [];

    const { result } = renderHook(
      () =>
        useRecording({
          model: 'test',
          source,
          onSourceMuted: () => events.push('muted'),
          onSourceUnmuted: () => events.push('unmuted'),
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.start();
      await tick(50);
    });

    await act(async () => {
      source.emitMuted();
      await tick(10);
    });

    await act(async () => {
      source.emitUnmuted();
      await tick(10);
    });

    expect(events).toEqual(['muted', 'unmuted']);
  });

  it('new recording with resetOnStart: false starts with isSourceMuted === false', async () => {
    const { wrapper } = createWrapper();
    const source = new MockAudioSource();

    const { result } = renderHook(() => useRecording({ model: 'test', source, resetOnStart: false }), { wrapper });

    // First recording — get to recording state and mute
    await act(async () => {
      result.current.start();
      await tick(50);
    });

    await act(async () => {
      source.emitMuted();
      await tick(10);
    });

    expect(result.current.isSourceMuted).toBe(true);

    // Cancel and start a new recording — isSourceMuted should be reset
    await act(async () => {
      result.current.cancel();
      await tick(10);
    });

    await act(async () => {
      result.current.start();
      await tick(10);
    });

    expect(result.current.isSourceMuted).toBe(false);
  });

  it('SSR snapshot has isPaused and isSourceMuted as false', async () => {
    const { RecordingStore } = await import('../../src/store');
    const store = new RecordingStore();
    const snap = store.getServerSnapshot();

    expect(snap.isPaused).toBe(false);
    expect(snap.isSourceMuted).toBe(false);
  });
});
