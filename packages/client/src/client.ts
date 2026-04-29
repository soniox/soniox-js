/**
 * SonioxClient - main entry point for the @soniox/client SDK
 *
 * Provides high-level `record()` for audio capture + transcription,
 * and low-level `stt()` for direct WebSocket session access
 */

import {
  RealtimeSttSession,
  RealtimeTtsConnection,
  SonioxError,
  TtsRestClient,
  resolveConnectionConfig,
} from '@soniox/core';
import type {
  ConfigContext,
  RealtimeTtsStream,
  SonioxConnectionConfig,
  ResolvedConnectionConfig,
  GenerateSpeechOptions,
  SttSessionConfig,
  SttSessionOptions,
  TtsStreamInput,
} from '@soniox/core';

import { MicrophoneSource } from './audio/microphone.js';
import type { ApiKeyConfig } from './auth.js';
import { resolveApiKey } from './auth.js';
import type { PermissionResolver } from './permissions/types.js';
import type { RecordOptions, SttConfigInput } from './recording.js';
import { Recording } from './recording.js';

const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

/**
 * Options for creating a SonioxClient instance.
 */
export type SonioxClientOptions = {
  /**
   * Connection configuration — sync object or async function.
   *
   * When provided as a function, it is called once per recording session,
   * allowing you to fetch a fresh temporary API key and connection settings
   * from your backend at runtime.
   *
   * @example
   * ```typescript
   * // Sync config with region
   * const client = new SonioxClient({
   *   config: { api_key: tempKey, region: 'eu' },
   * });
   *
   * // Async config (recommended for production)
   * const client = new SonioxClient({
   *   config: async () => {
   *     const res = await fetch('/api/soniox-config', { method: 'POST' });
   *     return await res.json(); // { api_key, region, ... }
   *   },
   * });
   * ```
   */
  config?: SonioxConnectionConfig | ((context?: ConfigContext) => Promise<SonioxConnectionConfig>) | undefined;

  /**
   * API key configuration.
   *
   * - `string` - A pre-fetched temporary API key (e.g., injected from SSR)
   * - `() => Promise<string>` - Async function that fetches a fresh key from your backend
   *
   * @deprecated Use `config` instead.
   */
  api_key?: ApiKeyConfig | undefined;

  /**
   * WebSocket URL for real-time connections.
   * @default 'wss://stt-rt.soniox.com/transcribe-websocket'
   * @deprecated Use `config.stt_ws_url` or `config.region` instead.
   */
  ws_base_url?: string | undefined;

  /**
   * Optional permission resolver for pre-flight microphone permission checks.
   * Not set by default (SSR-safe, RN-safe).
   *
   * @example
   * ```typescript
   * import { BrowserPermissionResolver } from '@soniox/client';
   * const client = new SonioxClient({
   *   config: { api_key: tempKey },
   *   permissions: new BrowserPermissionResolver(),
   * });
   * ```
   */
  permissions?: PermissionResolver | undefined;

  /**
   * Default maximum number of audio chunks to buffer while waiting for key/connection.
   * Can be overridden per-recording.
   * @default 1000
   */
  buffer_queue_size?: number | undefined;

  /**
   * Default session options applied to all sessions.
   * Can be overridden per-recording.
   */
  default_session_options?: SttSessionOptions | undefined;
};

/**
 * Options for creating a low-level STT session.
 */
export type SttOptions = {
  /**
   * Resolved API key string (temporary key).
   */
  api_key: string;

  /**
   * Session options (signal, etc.).
   */
  session_options?: SttSessionOptions | undefined;
};

/**
 * Main entry point for the Soniox client SDK.
 *
 * @example
 * ```typescript
 * // Recommended: async config with region
 * const client = new SonioxClient({
 *   config: async () => {
 *     const res = await fetch('/api/soniox-config', { method: 'POST' });
 *     return await res.json(); // { api_key, region }
 *   },
 * });
 *
 * // High-level: record from microphone
 * const recording = client.realtime.record({ model: 'stt-rt-v4' });
 * recording.on('result', (r) => console.log(r.tokens));
 * await recording.stop();
 *
 * // Low-level: direct session access
 * const session = client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: key });
 * await session.connect();
 * ```
 */
export class SonioxClient {
  /** @internal */
  readonly _configResolver: (context?: ConfigContext) => Promise<ResolvedConnectionConfig>;
  /**
   * STT WebSocket URL resolved at construction time from the client's `config`,
   * when that config is a plain object (not an async function). Used by the
   * synchronous low-level `client.realtime.stt()` factory so it honors the
   * configured region. Remains `undefined` for async-config clients — those
   * must supply `ws_base_url` or use `client.realtime.record()`.
   *
   * @internal
   */
  private readonly preResolvedSttWsUrl: string | undefined;
  private readonly permissionResolver: PermissionResolver | undefined;
  private readonly defaultBufferQueueSize: number;
  private readonly defaultSessionOptions: SttSessionOptions | undefined;
  private readonly wsBaseUrl: string | undefined;

  /**
   * Real-time API namespace
   */
  readonly realtime: {
    /**
     * Start a high-level recording session.
     *
     * Returns synchronously so callers can attach event listeners before
     * any async work (key fetch, mic access, connection) begins.
     *
     * @param options - Session config + recording options
     * @returns Recording instance
     */
    record: (options: RecordOptions) => Recording;

    /**
     * Create a low-level STT session.
     *
     * The WebSocket URL is derived from the client's `config` (respecting
     * `region` / `base_domain` / `stt_ws_url`) when `config` is a plain
     * object, or from `ws_base_url` on the legacy path. If `config` was
     * passed as an async function, call `client.realtime.record()` instead,
     * or pass `ws_base_url` explicitly to `SonioxClient`.
     *
     * @param config - Session configuration (sent to server)
     * @param options - API key and session options
     * @returns RealtimeSttSession instance
     * @throws {@link SonioxError} if the WebSocket URL cannot be resolved
     *   synchronously (async-config client without `ws_base_url`).
     */
    stt: (config: SttSessionConfig, options: SttOptions) => RealtimeSttSession;

    /**
     * TTS factory — callable for single-stream, `.multiStream()` for multi-stream.
     *
     * Uses the client's config resolver to obtain credentials and TTS WebSocket URL.
     *
     * @example Single stream
     * ```typescript
     * const stream = await client.realtime.tts({
     *   model: 'tts-rt-v1',
     *   voice: 'Adrian',
     *   language: 'en',
     *   audio_format: 'wav',
     * });
     * stream.sendText("Hello");
     * stream.finish();
     * for await (const chunk of stream) { process(chunk); }
     * ```
     *
     * @example Multi-stream
     * ```typescript
     * const conn = await client.realtime.tts.multiStream();
     * const s1 = await conn.stream({
     *   model: 'tts-rt-v1',
     *   voice: 'Adrian',
     *   language: 'en',
     *   audio_format: 'wav',
     * });
     * ```
     */
    tts: ClientTtsFactory;
  };

  /**
   * REST TTS API namespace.
   *
   * @example
   * ```typescript
   * const audio = await client.tts.generate({
   *   text: 'Hello',
   *   voice: 'Adrian',
   *   language: 'en',
   * });
   * ```
   */
  readonly tts: {
    /**
     * Generate speech audio from text. Returns the full audio as a `Uint8Array`.
     */
    generate(options: GenerateSpeechOptions): Promise<Uint8Array>;
    /**
     * Generate speech audio as a streaming async iterable.
     * Yields `Uint8Array` chunks as they arrive.
     */
    generateStream(options: GenerateSpeechOptions): AsyncIterable<Uint8Array>;
  };

  constructor(options: SonioxClientOptions) {
    if (options.config !== undefined && options.api_key !== undefined) {
      throw new Error('Cannot specify both `config` and `api_key`. Use `config` for new code.');
    }
    if (options.config === undefined && options.api_key === undefined) {
      throw new Error('Either `config` or `api_key` must be provided.');
    }

    const { resolver, preResolvedSttWsUrl } = buildConfigResolver(options);
    this._configResolver = resolver;
    this.preResolvedSttWsUrl = preResolvedSttWsUrl;
    this.wsBaseUrl = options.ws_base_url;
    this.permissionResolver = options.permissions;
    this.defaultBufferQueueSize = options.buffer_queue_size ?? 1000;
    this.defaultSessionOptions = options.default_session_options;

    const ttsCall = (input?: TtsStreamInput): Promise<RealtimeTtsStream> => this.createSingleTtsStream(input ?? {});
    ttsCall.multiStream = (): Promise<RealtimeTtsConnection> => this.createTtsConnection();

    this.tts = {
      generate: (opts: GenerateSpeechOptions) => this.ttsRestGenerate(opts),
      generateStream: (opts: GenerateSpeechOptions) => this.ttsRestGenerateStream(opts),
    };

    this.realtime = {
      record: (recordOptions: RecordOptions) => this.createRecording(recordOptions),
      stt: (config: SttSessionConfig, sttOptions: SttOptions) => this.createSession(config, sttOptions),
      tts: ttsCall,
    };
  }

  /**
   * Permission resolver, if configured.
   * Returns `undefined` if no resolver was provided (SSR-safe).
   *
   * @example
   * ```typescript
   * const mic = await client.permissions?.check('microphone');
   * if (mic?.status === 'denied') {
   *   showSettingsMessage();
   * }
   * ```
   */
  get permissions(): PermissionResolver | undefined {
    return this.permissionResolver;
  }

  private createRecording(options: RecordOptions): Recording {
    // Extract recording-specific options from the combined config
    const {
      source,
      signal,
      buffer_queue_size,
      session_options,
      session_config,
      auto_reconnect,
      max_reconnect_attempts,
      reconnect_base_delay_ms,
      reset_transcript_on_reconnect,
      ...sttConfig
    } = options;

    const audioSource = source ?? new MicrophoneSource();

    // When session_config function is provided, use it; otherwise use flat fields
    const sttConfigInput: SttConfigInput = session_config ?? sttConfig;

    return new Recording(this._configResolver, sttConfigInput, audioSource, {
      buffer_queue_size: buffer_queue_size ?? this.defaultBufferQueueSize,
      session_options: {
        ...this.defaultSessionOptions,
        ...session_options,
        ...(signal !== undefined ? { signal } : {}),
      },
      ...(signal !== undefined ? { signal } : {}),
      ...(auto_reconnect !== undefined ? { auto_reconnect } : {}),
      ...(max_reconnect_attempts !== undefined ? { max_reconnect_attempts } : {}),
      ...(reconnect_base_delay_ms !== undefined ? { reconnect_base_delay_ms } : {}),
      ...(reset_transcript_on_reconnect !== undefined ? { reset_transcript_on_reconnect } : {}),
    });
  }

  private createSession(config: SttSessionConfig, options: SttOptions): RealtimeSttSession {
    const mergedSessionOptions: SttSessionOptions = {
      ...this.defaultSessionOptions,
      ...options.session_options,
    };

    const wsUrl = this.wsBaseUrl ?? this.preResolvedSttWsUrl;
    if (wsUrl === undefined) {
      throw new SonioxError(
        'Cannot resolve STT WebSocket URL synchronously because `config` was provided as an async function. ' +
          'Either pass `ws_base_url` to `SonioxClient`, use a sync `config` object, ' +
          'or call `client.realtime.record()` which supports async config.',
        'state_error'
      );
    }
    return new RealtimeSttSession(options.api_key, wsUrl, config, mergedSessionOptions);
  }

  private async createSingleTtsStream(input: TtsStreamInput): Promise<RealtimeTtsStream> {
    const resolved = await this._configResolver({ usage: 'tts_rt' });
    const connection = new RealtimeTtsConnection(resolved.api_key, resolved.tts_ws_url, resolved.tts_defaults);
    return connection._openStream(input, true);
  }

  private async createTtsConnection(): Promise<RealtimeTtsConnection> {
    const resolved = await this._configResolver({ usage: 'tts_rt' });
    const connection = new RealtimeTtsConnection(resolved.api_key, resolved.tts_ws_url, resolved.tts_defaults);
    await connection.connect();
    return connection;
  }

  private async ttsRestGenerate(options: GenerateSpeechOptions): Promise<Uint8Array> {
    const resolved = await this._configResolver({ usage: 'tts_rt' });
    const rest = new TtsRestClient(resolved.api_key, resolved.tts_api_url);
    return rest.generate(options);
  }

  private async *ttsRestGenerateStream(options: GenerateSpeechOptions): AsyncIterable<Uint8Array> {
    const resolved = await this._configResolver({ usage: 'tts_rt' });
    const rest = new TtsRestClient(resolved.api_key, resolved.tts_api_url);
    yield* rest.generateStream(options);
  }
}

/**
 * Callable TTS factory with `.multiStream()` for multi-stream connections.
 */
export interface ClientTtsFactory {
  (input?: TtsStreamInput): Promise<RealtimeTtsStream>;
  multiStream(): Promise<RealtimeTtsConnection>;
}

type ConfigResolver = (context?: ConfigContext) => Promise<ResolvedConnectionConfig>;

type BuiltConfigResolver = {
  resolver: ConfigResolver;
  /**
   * STT WebSocket URL available synchronously (when `config` is a plain object
   * or on the legacy `api_key` path). `undefined` when the user passed an
   * async `config` function — the URL is only known after the function runs.
   */
  preResolvedSttWsUrl: string | undefined;
};

function buildConfigResolver(options: SonioxClientOptions): BuiltConfigResolver {
  if (options.config !== undefined) {
    const configInput = options.config;
    const resolver: ConfigResolver = async (context) => {
      const raw = typeof configInput === 'function' ? await configInput(context) : configInput;
      return resolveConnectionConfig(raw);
    };

    // If the config is a plain object we can pre-resolve the URLs for the
    // synchronous low-level `client.realtime.stt()` factory.
    const preResolvedSttWsUrl =
      typeof configInput === 'function' ? undefined : resolveConnectionConfig(configInput).stt_ws_url;

    return { resolver, preResolvedSttWsUrl };
  }

  // Legacy path: api_key (+ optional ws_base_url)
  const apiKeyConfig = options.api_key!;
  const wsBaseUrl = options.ws_base_url ?? SONIOX_WS_URL;
  const resolver: ConfigResolver = async () => {
    const apiKey = await resolveApiKey(apiKeyConfig);
    return {
      api_key: apiKey,
      api_domain: 'https://api.soniox.com',
      stt_ws_url: wsBaseUrl,
      tts_api_url: 'https://tts-rt.soniox.com',
      tts_ws_url: 'wss://tts-rt.soniox.com/tts-websocket',
      stt_defaults: {},
      tts_defaults: {},
      session_defaults: {},
    };
  };
  return { resolver, preResolvedSttWsUrl: wsBaseUrl };
}
