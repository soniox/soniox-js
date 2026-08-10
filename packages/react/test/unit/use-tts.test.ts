import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SonioxClient } from '@soniox/client';
import { SonioxProvider, useTts } from '../../src';

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

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useTts REST mode voice requirement', () => {
  it('surfaces a clear error when REST mode is used without `voice`', async () => {
    const generateStream = jest.fn();

    const client = new SonioxClient({ api_key: 'temp:test-key' });
    // Replace the TTS REST client with a spy so we can assert it is NOT called.
    (client as unknown as { tts: { generateStream: typeof generateStream } }).tts = {
      generateStream,
    };

    const wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { client }, children);

    const errors: Error[] = [];
    const { result } = renderHook(
      () =>
        useTts({
          mode: 'rest',
          onError: (error) => errors.push(error),
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.speak('Hello world');
      await tick(10);
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/requires a `voice`/);
    expect(result.current.state).toBe('error');
    expect(result.current.error?.message).toMatch(/requires a `voice`/);
    expect(generateStream).not.toHaveBeenCalled();
  });

  it('proceeds to generateStream when REST mode has a voice', async () => {
    const generateStream = jest.fn(() => {
      return (async function* () {
        // Emit a single empty chunk so the consumer loop completes.
        yield new Uint8Array([1, 2, 3]);
      })();
    });

    const client = new SonioxClient({ api_key: 'temp:test-key' });
    (client as unknown as { tts: { generateStream: typeof generateStream } }).tts = {
      generateStream,
    };

    const wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { client }, children);

    const errors: Error[] = [];
    const chunks: Uint8Array[] = [];
    const { result } = renderHook(
      () =>
        useTts({
          mode: 'rest',
          voice: 'Adrian',
          speed: 1.2,
          reduce_silence: true,
          onError: (error) => errors.push(error),
          onAudio: (chunk) => chunks.push(chunk),
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.speak('Hello world');
      await tick(20);
    });

    expect(errors).toHaveLength(0);
    expect(generateStream).toHaveBeenCalledTimes(1);
    const options = generateStream.mock.calls[0]![0] as {
      text: string;
      voice: string;
      speed?: number;
      reduce_silence?: boolean;
    };
    expect(options.text).toBe('Hello world');
    expect(options.voice).toBe('Adrian');
    expect(options.speed).toBe(1.2);
    expect(options.reduce_silence).toBe(true);
    expect(chunks).toHaveLength(1);
  });
});

describe('useTts WebSocket mode timestamps', () => {
  type Handler = (...args: unknown[]) => void;

  function createFakeStream() {
    const listeners = new Map<string, Set<Handler>>();
    return {
      state: 'active' as const,
      sentText: [] as Array<{ text: string; end?: boolean }>,
      on(event: string, handler: Handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
      },
      off(event: string, handler: Handler) {
        listeners.get(event)?.delete(handler);
      },
      sendText(text: string, options?: { end?: boolean }) {
        this.sentText.push({ text, end: options?.end });
      },
      cancel() {},
      emit(event: string, ...args: unknown[]) {
        for (const handler of listeners.get(event) ?? []) handler(...args);
      },
    };
  }

  it('forwards return_timestamps to the stream input and delivers timestamps via onAudio', async () => {
    const fakeStream = createFakeStream();
    const tts = jest.fn(async () => fakeStream);

    const client = new SonioxClient({ api_key: 'temp:test-key' });
    (client as unknown as { realtime: { tts: typeof tts } }).realtime = { tts };

    const wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { client }, children);

    const audioCalls: Array<{ chunk: Uint8Array; timestamps?: unknown }> = [];
    const { result } = renderHook(
      () =>
        useTts({
          voice: 'Adrian',
          return_timestamps: true,
          onAudio: (chunk, timestamps) => audioCalls.push({ chunk, timestamps }),
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.speak('Hi');
      await tick(20);
    });

    expect(tts).toHaveBeenCalledTimes(1);
    const streamInput = tts.mock.calls[0]![0] as { return_timestamps?: boolean };
    expect(streamInput.return_timestamps).toBe(true);

    const timestamps = {
      characters: ['H', 'i'],
      character_start_times_seconds: [0.0, 0.1],
      character_end_times_seconds: [0.1, 0.25],
    };
    act(() => {
      fakeStream.emit('audio', new Uint8Array([1, 2, 3]), timestamps);
    });

    expect(audioCalls).toHaveLength(1);
    expect(audioCalls[0]!.timestamps).toEqual(timestamps);
  });
});
