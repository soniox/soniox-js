import { RealtimeSttSession, RealtimeTtsConnection } from '@soniox/core';
import type { RealtimeTtsStream, TtsStreamInput } from '@soniox/core';

import type { RealtimeClientOptions, SttSessionConfig, SttSessionOptions } from '../types/public/realtime.js';

/**
 * Callable TTS factory with `.multiStream()` for multi-stream connections.
 */
export interface TtsFactory {
  /**
   * Create a single-stream TTS connection.
   * Opens a WebSocket, starts one stream, and returns a ready-to-use stream
   * that owns its connection (closing the stream closes the connection).
   *
   * @example
   * ```typescript
   * const stream = await client.realtime.tts({
   *   model: 'tts-rt-v1-preview',
   *   voice: 'Adrian',
   *   language: 'en',
   *   audio_format: 'wav',
   * });
   * stream.sendText("Hello world");
   * stream.finish();
   * for await (const chunk of stream) { process(chunk); }
   * ```
   */
  (input?: TtsStreamInput): Promise<RealtimeTtsStream>;

  /**
   * Create a multi-stream TTS connection.
   * Opens a single WebSocket that can host up to 5 concurrent streams.
   *
   * @example
   * ```typescript
   * const conn = await client.realtime.tts.multiStream();
   * const s1 = await conn.stream({
   *   model: 'tts-rt-v1-preview',
   *   voice: 'Adrian',
   *   language: 'en',
   *   audio_format: 'wav',
   * });
   * // Use any voice returned by client.tts.listModels()
   * const s2 = await conn.stream({
   *   model: 'tts-rt-v1-preview',
   *   voice: someOtherVoice,
   *   language: 'en',
   *   audio_format: 'wav',
   * });
   * ```
   */
  multiStream(): Promise<RealtimeTtsConnection>;
}

/**
 * Real-time API factory for creating STT sessions and TTS connections.
 *
 * @example STT
 * ```typescript
 * const session = client.realtime.stt({ model: 'stt-rt-v4' });
 * await session.connect();
 * ```
 *
 * @example TTS (single stream)
 * ```typescript
 * const stream = await client.realtime.tts({
 *   model: 'tts-rt-v1-preview',
 *   voice: 'Adrian',
 *   language: 'en',
 *   audio_format: 'wav',
 * });
 * stream.sendText("Hello");
 * stream.finish();
 * for await (const chunk of stream) { ... }
 * ```
 *
 * @example TTS (multi-stream)
 * ```typescript
 * const conn = await client.realtime.tts.multiStream();
 * const stream = await conn.stream({
 *   model: 'tts-rt-v1-preview',
 *   voice: 'Adrian',
 *   language: 'en',
 *   audio_format: 'wav',
 * });
 * ```
 */
export class SonioxRealtimeApi {
  private readonly options: RealtimeClientOptions;

  readonly tts: TtsFactory;

  constructor(options: RealtimeClientOptions) {
    this.options = options;

    const ttsCall = (input?: TtsStreamInput): Promise<RealtimeTtsStream> => {
      return this.createSingleTtsStream(input ?? {});
    };
    ttsCall.multiStream = (): Promise<RealtimeTtsConnection> => {
      return this.createTtsConnection();
    };
    this.tts = ttsCall;
  }

  /**
   * Create a new Speech-to-Text session.
   *
   * `config` is shallow-merged on top of `stt_defaults` from the client
   * options; caller-provided fields override the defaults.
   */
  stt(config: SttSessionConfig, options?: SttSessionOptions): RealtimeSttSession {
    const mergedOptions: SttSessionOptions = {
      ...this.options.default_session_options,
      ...options,
    };
    const mergedConfig: SttSessionConfig = {
      ...this.options.stt_defaults,
      ...config,
    };
    return new RealtimeSttSession(this.options.api_key, this.options.ws_base_url, mergedConfig, mergedOptions);
  }

  private async createSingleTtsStream(input: TtsStreamInput): Promise<RealtimeTtsStream> {
    const connection = new RealtimeTtsConnection(
      this.options.api_key,
      this.options.tts_ws_url,
      this.options.tts_defaults ?? {},
      this.options.tts_connection_options
    );
    return connection._openStream(input, true);
  }

  private async createTtsConnection(): Promise<RealtimeTtsConnection> {
    const connection = new RealtimeTtsConnection(
      this.options.api_key,
      this.options.tts_ws_url,
      this.options.tts_defaults ?? {},
      this.options.tts_connection_options
    );
    await connection.connect();
    return connection;
  }
}

// Re-export STT session class
export { RealtimeSttSession } from '@soniox/core';

// Re-export TTS classes
export { RealtimeTtsConnection, RealtimeTtsStream } from '@soniox/core';

// Re-export helpers
export { segmentRealtimeTokens } from '@soniox/core';
export { RealtimeSegmentBuffer } from '@soniox/core';
export { RealtimeUtteranceBuffer } from '@soniox/core';

// Re-export errors
export {
  RealtimeError,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  AbortError,
  StateError,
} from '@soniox/core';
