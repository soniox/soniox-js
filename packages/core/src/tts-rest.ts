/**
 * Browser-safe REST TTS client.
 *
 * Uses only `globalThis.fetch` — no Node-specific dependencies.
 * Shared by both `@soniox/node` and `@soniox/client`.
 */

import { createAbortError, createHttpError, createNetworkError } from './http-errors.js';
import type { GenerateSpeechOptions } from './types/tts.js';

const DEFAULT_MODEL = 'tts-rt-v1-preview';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_AUDIO_FORMAT = 'wav';

type TtsRestPayload = {
  model: string;
  language: string;
  voice: string;
  audio_format: string;
  text: string;
  sample_rate?: number;
  bitrate?: number;
};

function buildPayload(options: GenerateSpeechOptions): TtsRestPayload {
  const payload: TtsRestPayload = {
    model: options.model ?? DEFAULT_MODEL,
    language: options.language ?? DEFAULT_LANGUAGE,
    voice: options.voice,
    audio_format: options.audio_format ?? DEFAULT_AUDIO_FORMAT,
    text: options.text,
  };
  if (options.sample_rate !== undefined) {
    payload.sample_rate = options.sample_rate;
  }
  if (options.bitrate !== undefined) {
    payload.bitrate = options.bitrate;
  }
  return payload;
}

/**
 * Normalizes fetch Headers to a plain object with lowercase keys.
 * Duplicated here (rather than imported from `@soniox/node`) to keep
 * this module browser-safe.
 */
function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TimeoutError';
  }
  return false;
}

/**
 * Browser-safe REST client for TTS generation.
 *
 * Provides `generate()` (buffered) and `generateStream()` (streaming)
 * using only `globalThis.fetch`. HTTP failures are surfaced as
 * {@link SonioxHttpError}, matching the rest of the Soniox SDK.
 *
 * Authentication uses the `Authorization: Bearer <api_key>` header.
 *
 * @example
 * ```typescript
 * const client = new TtsRestClient(apiKey, 'https://tts-rt.soniox.com');
 * const audio = await client.generate({ text: 'Hello', voice: 'Adrian' });
 * ```
 */
export class TtsRestClient {
  private readonly apiKey: string;
  private readonly ttsApiUrl: string;

  constructor(apiKey: string, ttsApiUrl: string) {
    this.apiKey = apiKey;
    this.ttsApiUrl = ttsApiUrl;
  }

  /**
   * Generate speech audio from text. Returns the full audio as a `Uint8Array`.
   *
   * @throws {@link SonioxHttpError} on non-2xx responses, network failures,
   * or aborted requests.
   */
  async generate(options: GenerateSpeechOptions): Promise<Uint8Array> {
    const url = `${this.ttsApiUrl}/tts`;
    const response = await this.sendRequest(url, options);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Generate speech audio from text as a streaming async iterable.
   *
   * Yields `Uint8Array` chunks as they arrive from the server response body.
   * Lower time-to-first-audio than {@link generate}.
   *
   * **Known limitation:** Mid-stream server errors (reported via HTTP trailers)
   * cannot be detected through the `fetch` API. The iterator may end early
   * without an explicit error. Use WebSocket TTS for reliable error detection.
   *
   * @throws {@link SonioxHttpError} on non-2xx responses, network failures,
   * or aborted requests (before the stream starts).
   */
  async *generateStream(options: GenerateSpeechOptions): AsyncIterable<Uint8Array> {
    const url = `${this.ttsApiUrl}/tts`;
    const response = await this.sendRequest(url, options);

    if (!response.body) {
      throw createHttpError(
        url,
        'POST',
        response.status,
        headersToObject(response.headers),
        'Response has no body stream'
      );
    }

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Internal request helper. Performs the fetch, maps network/abort failures
   * to {@link SonioxHttpError}, and throws on non-2xx responses.
   */
  private async sendRequest(url: string, options: GenerateSpeechOptions): Promise<Response> {
    const payload = buildPayload(options);

    let response: Response;
    try {
      response = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        ...(options.signal && { signal: options.signal }),
      });
    } catch (cause) {
      if (isAbortLikeError(cause)) {
        throw createAbortError(url, 'POST', cause);
      }
      throw createNetworkError(url, 'POST', cause);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw createHttpError(url, 'POST', response.status, headersToObject(response.headers), bodyText);
    }

    return response;
  }
}
