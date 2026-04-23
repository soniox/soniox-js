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
    const options = generateStream.mock.calls[0]![0] as { text: string; voice: string };
    expect(options.text).toBe('Hello world');
    expect(options.voice).toBe('Adrian');
    expect(chunks).toHaveLength(1);
  });
});
