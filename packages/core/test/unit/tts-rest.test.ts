import { SonioxHttpError, TtsRestClient } from '@soniox/core';

type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];

/**
 * Minimal Response stub: only the fields the TtsRestClient actually
 * touches (`ok`, `status`, `headers`, `text`, `arrayBuffer`, `body`).
 */
type MinimalReadable = {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
};

type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body: MinimalReadable | null;
};

function okResponse(bytes: Uint8Array, headers: Record<string, string> = {}): MockResponse {
  // Copy into a fresh buffer so `arrayBuffer()` always returns a non-shared view.
  const buffer = new Uint8Array(bytes).buffer;
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(buffer),
    body: null,
  };
}

function errorResponse(status: number, bodyText: string, headers: Record<string, string> = {}): MockResponse {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    text: () => Promise.resolve(bodyText),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    body: null,
  };
}

function streamingResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): MockResponse {
  let i = 0;
  const body: MinimalReadable = {
    getReader() {
      return {
        read() {
          const next = chunks[i++];
          if (next !== undefined) {
            return Promise.resolve({ done: false, value: next });
          }
          return Promise.resolve({ done: true });
        },
        releaseLock() {
          // no-op
        },
      };
    },
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    body,
  };
}

describe('TtsRestClient', () => {
  const apiKey = 'test-api-key';
  const ttsApiUrl = 'https://tts-rt.soniox.com';

  let fetchMock: jest.Mock<Promise<MockResponse>, [FetchInput, FetchInit?]>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
  });

  describe('generate()', () => {
    it('sends Bearer auth header and omits api_key from the body', async () => {
      fetchMock.mockResolvedValueOnce(okResponse(new Uint8Array([1, 2, 3])));

      const client = new TtsRestClient(apiKey, ttsApiUrl);
      const audio = await client.generate({ text: 'Hello', voice: 'Adrian' });

      expect(audio).toEqual(new Uint8Array([1, 2, 3]));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://tts-rt.soniox.com/tts');

      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
      expect(headers['Content-Type']).toBe('application/json');

      const payload = JSON.parse(init!.body as string) as Record<string, unknown>;
      expect(payload).not.toHaveProperty('api_key');
      expect(payload).toMatchObject({
        text: 'Hello',
        voice: 'Adrian',
        model: 'tts-rt-v1',
        language: 'en',
        audio_format: 'wav',
      });
    });

    it('throws SonioxHttpError with status/headers/body on a non-2xx response', async () => {
      fetchMock.mockResolvedValueOnce(
        errorResponse(400, '{"error_code":3001,"error_message":"Invalid voice"}', {
          'content-type': 'application/json',
        })
      );

      const client = new TtsRestClient(apiKey, ttsApiUrl);

      let thrown: unknown;
      try {
        await client.generate({ text: 'Hi', voice: 'Nope' });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(SonioxHttpError);
      const httpErr = thrown as SonioxHttpError;
      expect(httpErr.code).toBe('http_error');
      expect(httpErr.statusCode).toBe(400);
      expect(httpErr.method).toBe('POST');
      expect(httpErr.url).toBe('https://tts-rt.soniox.com/tts');
      expect(httpErr.bodyText).toContain('Invalid voice');
      expect(httpErr.headers?.['content-type']).toBe('application/json');
    });

    it('wraps network failures as SonioxHttpError with network_error code', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const client = new TtsRestClient(apiKey, ttsApiUrl);

      await expect(client.generate({ text: 'x', voice: 'Adrian' })).rejects.toMatchObject({
        code: 'network_error',
        method: 'POST',
        url: 'https://tts-rt.soniox.com/tts',
      });
    });

    it('wraps AbortError as SonioxHttpError with aborted code', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      fetchMock.mockRejectedValueOnce(abortErr);

      const client = new TtsRestClient(apiKey, ttsApiUrl);

      await expect(client.generate({ text: 'x', voice: 'Adrian' })).rejects.toMatchObject({
        code: 'aborted',
        method: 'POST',
      });
    });
  });

  describe('generateStream()', () => {
    it('yields response body chunks and uses Bearer auth', async () => {
      fetchMock.mockResolvedValueOnce(streamingResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]));

      const client = new TtsRestClient(apiKey, ttsApiUrl);
      const chunks: Uint8Array[] = [];
      for await (const chunk of client.generateStream({ text: 'Hi', voice: 'Adrian' })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]);

      const [, init] = fetchMock.mock.calls[0]!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
      const payload = JSON.parse(init!.body as string) as Record<string, unknown>;
      expect(payload).not.toHaveProperty('api_key');
    });

    it('throws SonioxHttpError on non-2xx before yielding', async () => {
      fetchMock.mockResolvedValueOnce(errorResponse(500, 'boom'));

      const client = new TtsRestClient(apiKey, ttsApiUrl);

      const iterator = client.generateStream({ text: 'x', voice: 'Adrian' });
      await expect(iterator[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(SonioxHttpError);
    });
  });
});
