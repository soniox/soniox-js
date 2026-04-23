import { writeFile } from 'node:fs/promises';

import { TtsRestClient } from '@soniox/core';
import type { GenerateSpeechOptions, TtsModel } from '@soniox/core';

import type { HttpClient } from '../http/client.js';

export type { GenerateSpeechOptions } from '@soniox/core';

/**
 * REST API for Text-to-Speech generation and TTS model listing.
 *
 * Accessed via `client.tts` on {@link SonioxNodeClient}.
 *
 * Inherits browser-safe `generate()` and `generateStream()` from
 * `TtsRestClient` in `@soniox/core`, and adds Node-specific methods
 * `generateToFile()` and `listModels()`.
 */
export class SonioxTtsApi extends TtsRestClient {
  private readonly http: HttpClient;

  constructor(apiKey: string, ttsApiUrl: string, http: HttpClient) {
    super(apiKey, ttsApiUrl);
    this.http = http;
  }

  /**
   * Generate speech audio and write to a file or writable stream.
   *
   * @param output - File path (string) or a `WritableStream<Uint8Array>`
   * @param options - Generation options
   * @returns Number of bytes written
   *
   * @example Write to file
   * ```typescript
   * const bytes = await client.tts.generateToFile('output.wav', {
   *   text: 'Hello world',
   *   voice: 'Adrian',
   *   language: 'en',
   * });
   * ```
   *
   * @example Write to a writable stream
   * ```typescript
   * const bytes = await client.tts.generateToFile(writableStream, {
   *   text: 'Hello world',
   *   voice: 'Adrian',
   *   language: 'en',
   * });
   * ```
   */
  async generateToFile(output: string | WritableStream<Uint8Array>, options: GenerateSpeechOptions): Promise<number> {
    if (typeof output === 'string') {
      const audio = await this.generate(options);
      await writeFile(output, audio);
      return audio.byteLength;
    }

    let bytesWritten = 0;
    const writer = output.getWriter();
    try {
      for await (const chunk of this.generateStream(options)) {
        await writer.write(chunk);
        bytesWritten += chunk.byteLength;
      }
    } finally {
      writer.releaseLock();
    }
    return bytesWritten;
  }

  /**
   * List available TTS models and their voices.
   *
   * @example
   * ```typescript
   * const models = await client.tts.listModels();
   * for (const model of models) {
   *   console.log(model.id, model.voices.map(v => v.id));
   * }
   * ```
   */
  async listModels(signal?: AbortSignal): Promise<TtsModel[]> {
    const response = await this.http.request<{ models: TtsModel[] }>({
      method: 'GET',
      path: '/v1/tts-models',
      ...(signal && { signal }),
    });
    return response.data.models;
  }
}
