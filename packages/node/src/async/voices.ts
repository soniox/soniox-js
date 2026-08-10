import type { HttpClient } from '../http/client.js';
import { isNotFoundError } from '../http/errors.js';
import type {
  CreateVoiceOptions,
  DeleteAllVoicesOptions,
  ListVoicesOptions,
  ListVoicesResponse,
  RecomputeVoiceOptions,
  SonioxVoiceData,
  VoiceIdentifier,
  VoiceModelStatusEntry,
  VoicesCountResponse,
} from '../types/public/index.js';

import { resolveUploadInput } from './upload-input.js';

/**
 * Maximum reference clip size allowed by the API (10 MB)
 */
const MAX_VOICE_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Default filename when none can be inferred for a reference clip
 */
const DEFAULT_VOICE_FILENAME = 'voice';

/**
 * Helper to extract the voice ID from a VoiceIdentifier
 */
function getVoiceId(voice: VoiceIdentifier): string {
  return typeof voice === 'string' ? voice : voice.id;
}

/**
 * Builds the JSON body for a recompute request.
 */
function buildRecomputeBody(options: RecomputeVoiceOptions): { model?: string | null } {
  return options.model !== undefined ? { model: options.model } : {};
}

/**
 * A custom (cloned) Text-to-Speech voice.
 *
 * Use a `ready` voice by passing its {@link SonioxVoice.id | id} as the
 * `voice` value in any TTS request (REST or realtime).
 */
export class SonioxVoice {
  readonly id: string;
  readonly name: string;
  readonly filename: string;
  readonly created_at: string;
  readonly models: VoiceModelStatusEntry[];

  constructor(
    data: SonioxVoiceData,
    private readonly _http: HttpClient
  ) {
    this.id = data.id;
    this.name = data.name;
    this.filename = data.filename;
    this.created_at = data.created_at;
    this.models = data.models;
  }

  /**
   * Returns the raw data for this voice.
   */
  toJSON(): SonioxVoiceData {
    return {
      id: this.id,
      name: this.name,
      filename: this.filename,
      created_at: this.created_at,
      models: this.models,
    };
  }

  /**
   * Returns true if the voice is `ready` for the given model.
   *
   * @param model - Name of the model to check.
   *
   * @example
   * ```typescript
   * const voice = await client.tts.voices.get(voiceId);
   * if (voice?.isReady('tts-rt-v2')) {
   *   const audio = await client.tts.generate({ text: 'Hi', voice: voice.id, language: 'en', model: 'tts-rt-v2' });
   * }
   * ```
   */
  isReady(model: string): boolean {
    return this.models.some((entry) => entry.model === model && entry.status === 'ready');
  }

  /**
   * Prepares this voice for use with available models it is not ready for yet.
   * Models the voice is already prepared for are left unchanged.
   *
   * @param options - Optional model to target and cancellation signal.
   * @returns The updated voice.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const voice = await client.tts.voices.get(voiceId);
   * const updated = await voice?.recompute();
   * ```
   */
  async recompute(options: RecomputeVoiceOptions = {}): Promise<SonioxVoice> {
    const { signal } = options;

    const response = await this._http.request<SonioxVoiceData>({
      method: 'POST',
      path: `/v1/voices/${this.id}/recompute`,
      body: buildRecomputeBody(options),
      ...(signal && { signal }),
    });

    return new SonioxVoice(response.data, this._http);
  }

  /**
   * Permanently deletes this voice and its embeddings.
   * This operation is idempotent - succeeds even if the voice doesn't exist.
   *
   * @param signal - Optional AbortSignal for cancellation.
   * @throws {@link SonioxHttpError} On API errors (except 404).
   *
   * @example
   * ```typescript
   * const voice = await client.tts.voices.get(voiceId);
   * if (voice) {
   *   await voice.delete();
   * }
   * ```
   */
  async delete(signal?: AbortSignal): Promise<void> {
    try {
      await this._http.request<null>({
        method: 'DELETE',
        path: `/v1/voices/${this.id}`,
        ...(signal && { signal }),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }
}

/**
 * Result set for voice listing.
 */
export class VoiceListResult implements AsyncIterable<SonioxVoice> {
  /**
   * Voices from the first page of results.
   */
  readonly voices: SonioxVoice[];

  /**
   * Pagination cursor for the next page. Null if no more pages.
   */
  readonly next_page_cursor: string | null;

  constructor(
    initialResponse: ListVoicesResponse<SonioxVoiceData>,
    private readonly _http: HttpClient,
    private readonly _limit: number | undefined,
    private readonly _signal: AbortSignal | undefined = undefined
  ) {
    this.voices = initialResponse.voices.map((data) => new SonioxVoice(data, _http));
    this.next_page_cursor = initialResponse.next_page_cursor;
  }

  /**
   * Returns the raw data for this list result.
   * Also used by JSON.stringify() to prevent serialization of internal HTTP client.
   */
  toJSON(): ListVoicesResponse<SonioxVoiceData> {
    return {
      voices: this.voices.map((v) => v.toJSON()),
      next_page_cursor: this.next_page_cursor,
    };
  }

  /**
   * Returns true if there are more pages of results beyond the first page.
   */
  isPaged(): boolean {
    return this.next_page_cursor !== null;
  }

  /**
   * Async iterator that automatically fetches all pages.
   * Use with `for await...of` to iterate through all voices.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<SonioxVoice> {
    // Yield voices from the first page
    for (const voice of this.voices) {
      yield voice;
    }

    // Fetch and yield subsequent pages
    let cursor = this.next_page_cursor;
    while (cursor !== null) {
      const response = await this._http.request<ListVoicesResponse<SonioxVoiceData>>({
        method: 'GET',
        path: '/v1/voices',
        query: {
          limit: this._limit,
          cursor,
        },
        ...(this._signal && { signal: this._signal }),
      });

      for (const data of response.data.voices) {
        yield new SonioxVoice(data, this._http);
      }

      cursor = response.data.next_page_cursor;
    }
  }
}

/**
 * REST API for managing custom (cloned) Text-to-Speech voices.
 *
 * Accessed via `client.tts.voices` on `SonioxNodeClient`.
 *
 * Create a voice from a short reference clip, wait until it is `ready` for the
 * model you intend to use, then pass its `id` as the `voice` value in any TTS
 * request.
 */
export class SonioxVoicesAPI {
  constructor(private http: HttpClient) {}

  /**
   * Creates a new voice by uploading a reference audio clip.
   *
   * The voice begins processing in the background per model. Poll
   * {@link SonioxVoicesAPI.get} (or check {@link SonioxVoice.isReady}) until the
   * model you need reports `ready`.
   *
   * @param options - The voice name and reference clip.
   * @returns The created voice.
   * @throws {@link SonioxHttpError} On API errors.
   * @throws `Error` On validation errors (file too large, invalid input).
   *
   * @example Create from a local file (Node.js)
   * ```typescript
   * import * as fs from 'node:fs';
   *
   * const buffer = await fs.promises.readFile('/path/to/reference.wav');
   * const voice = await client.tts.voices.create({
   *   name: 'My narrator',
   *   file: buffer,
   *   filename: 'reference.wav',
   * });
   * ```
   */
  async create(options: CreateVoiceOptions): Promise<SonioxVoice> {
    const { name, file, filename, signal, timeout_ms } = options;

    // Resolve the reference clip to a Blob and filename
    const { blob, filename: resolvedFilename } = await resolveUploadInput(file, {
      maxBytes: MAX_VOICE_FILE_SIZE,
      filenameOverride: filename,
      defaultFilename: DEFAULT_VOICE_FILENAME,
    });

    // Build the FormData
    const formData = new FormData();
    formData.append('name', name);
    formData.append('file', blob, resolvedFilename);

    // Build request options
    const requestOptions: Parameters<HttpClient['request']>[0] = {
      method: 'POST',
      path: '/v1/voices',
      body: formData,
    };

    if (signal !== undefined) {
      requestOptions.signal = signal;
    }

    if (timeout_ms !== undefined) {
      requestOptions.timeoutMs = timeout_ms;
    }

    const response = await this.http.request<SonioxVoiceData>(requestOptions);

    return new SonioxVoice(response.data, this.http);
  }

  /**
   * Retrieves the list of voices in your project.
   *
   * The returned result is async iterable - use `for await...of`.
   *
   * @param options - Optional pagination and cancellation parameters.
   * @returns VoiceListResult
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const result = await client.tts.voices.list();
   *
   * // Automatic paging - iterates through ALL voices across all pages
   * for await (const voice of result) {
   *   console.log(voice.id, voice.name);
   * }
   * ```
   */
  async list(options: ListVoicesOptions = {}): Promise<VoiceListResult> {
    const { limit, cursor, signal } = options;

    const response = await this.http.request<ListVoicesResponse<SonioxVoiceData>>({
      method: 'GET',
      path: '/v1/voices',
      query: {
        limit,
        cursor,
      },
      ...(signal && { signal }),
    });

    return new VoiceListResult(response.data, this.http, limit, signal);
  }

  /**
   * Returns the total number of voices in your project.
   *
   * @param options - Optional cancellation parameters.
   * @returns The total voice count.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const { total } = await client.tts.voices.count();
   * ```
   */
  async count(options: { signal?: AbortSignal } = {}): Promise<VoicesCountResponse> {
    const { signal } = options;

    const response = await this.http.request<VoicesCountResponse>({
      method: 'GET',
      path: '/v1/voices/count',
      ...(signal && { signal }),
    });

    return response.data;
  }

  /**
   * Retrieve metadata for a voice.
   *
   * @param voice - The UUID of the voice or a SonioxVoice instance.
   * @param signal - Optional AbortSignal for cancellation.
   * @returns The voice instance, or null if not found.
   * @throws {@link SonioxHttpError} On API errors (except 404).
   *
   * @example
   * ```typescript
   * const voice = await client.tts.voices.get('550e8400-e29b-41d4-a716-446655440000');
   * if (voice) {
   *   console.log(voice.name, voice.models);
   * }
   * ```
   */
  async get(voice: VoiceIdentifier, signal?: AbortSignal): Promise<SonioxVoice | null> {
    const voice_id = getVoiceId(voice);
    try {
      const response = await this.http.request<SonioxVoiceData>({
        method: 'GET',
        path: `/v1/voices/${voice_id}`,
        ...(signal && { signal }),
      });
      return new SonioxVoice(response.data, this.http);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Prepares a voice for use with available models it is not ready for yet.
   * Use this after a new model is released to make an existing voice usable
   * with it. Models the voice is already prepared for are left unchanged.
   *
   * @param voice - The UUID of the voice or a SonioxVoice instance.
   * @param options - Optional model to target and cancellation signal.
   * @returns The updated voice.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * // Prepare for every model the voice is not ready for yet
   * await client.tts.voices.recompute(voiceId);
   *
   * // Or target a specific model
   * await client.tts.voices.recompute(voiceId, { model: 'tts-rt-v2' });
   * ```
   */
  async recompute(voice: VoiceIdentifier, options: RecomputeVoiceOptions = {}): Promise<SonioxVoice> {
    const voice_id = getVoiceId(voice);
    const { signal } = options;

    const response = await this.http.request<SonioxVoiceData>({
      method: 'POST',
      path: `/v1/voices/${voice_id}/recompute`,
      body: buildRecomputeBody(options),
      ...(signal && { signal }),
    });

    return new SonioxVoice(response.data, this.http);
  }

  /**
   * Permanently deletes a voice and its embeddings.
   * This operation is idempotent - succeeds even if the voice doesn't exist.
   *
   * @param voice - The UUID of the voice or a SonioxVoice instance.
   * @param signal - Optional AbortSignal for cancellation.
   * @throws {@link SonioxHttpError} On API errors (except 404).
   *
   * @example
   * ```typescript
   * await client.tts.voices.delete('550e8400-e29b-41d4-a716-446655440000');
   * ```
   */
  async delete(voice: VoiceIdentifier, signal?: AbortSignal): Promise<void> {
    const voice_id = getVoiceId(voice);
    try {
      await this.http.request<null>({
        method: 'DELETE',
        path: `/v1/voices/${voice_id}`,
        ...(signal && { signal }),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Permanently deletes all voices in your project.
   * Iterates through all pages of voices and deletes each one.
   *
   * @param options - Optional cancellation signal.
   * @throws {@link SonioxHttpError} On API errors.
   * @throws `Error` If the operation is aborted via signal.
   *
   * @example
   * ```typescript
   * await client.tts.voices.delete_all();
   * ```
   */
  async delete_all(options: DeleteAllVoicesOptions = {}): Promise<void> {
    const { signal } = options;
    const result = await this.list({ signal });

    for await (const voice of result) {
      signal?.throwIfAborted();
      await this.delete(voice, signal);
    }
  }
}
