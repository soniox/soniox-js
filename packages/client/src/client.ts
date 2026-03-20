/**
 * SonioxClient - main entry point for the @soniox/client SDK
 *
 * Provides high-level `record()` for audio capture + transcription,
 * and low-level `stt()` for direct WebSocket session access
 */

import { RealtimeSttSession, resolveConnectionConfig } from '@soniox/core';
import type {
  SonioxConnectionConfig,
  ResolvedConnectionConfig,
  SttSessionConfig,
  SttSessionOptions,
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
  config?: SonioxConnectionConfig | (() => Promise<SonioxConnectionConfig>) | undefined;

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
  readonly _configResolver: () => Promise<ResolvedConnectionConfig>;
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
     * Create a low-level STT session
     *
     * @param config - Session configuration (sent to server)
     * @param options - API key and session options
     * @returns RealtimeSttSession instance
     */
    stt: (config: SttSessionConfig, options: SttOptions) => RealtimeSttSession;
  };

  constructor(options: SonioxClientOptions) {
    if (options.config !== undefined && options.api_key !== undefined) {
      throw new Error('Cannot specify both `config` and `api_key`. Use `config` for new code.');
    }
    if (options.config === undefined && options.api_key === undefined) {
      throw new Error('Either `config` or `api_key` must be provided.');
    }

    this._configResolver = buildConfigResolver(options);
    this.wsBaseUrl = options.ws_base_url;
    this.permissionResolver = options.permissions;
    this.defaultBufferQueueSize = options.buffer_queue_size ?? 1000;
    this.defaultSessionOptions = options.default_session_options;

    // Bind the realtime namespace methods
    this.realtime = {
      record: (recordOptions: RecordOptions) => this.createRecording(recordOptions),
      stt: (config: SttSessionConfig, sttOptions: SttOptions) => this.createSession(config, sttOptions),
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
    const { source, signal, buffer_queue_size, session_options, session_config, ...sttConfig } = options;

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
    });
  }

  private createSession(config: SttSessionConfig, options: SttOptions): RealtimeSttSession {
    const mergedSessionOptions: SttSessionOptions = {
      ...this.defaultSessionOptions,
      ...options.session_options,
    };

    const wsUrl = this.wsBaseUrl ?? resolveConnectionConfig({ api_key: options.api_key }).stt_ws_url;
    return new RealtimeSttSession(options.api_key, wsUrl, config, mergedSessionOptions);
  }
}

function buildConfigResolver(options: SonioxClientOptions): () => Promise<ResolvedConnectionConfig> {
  if (options.config !== undefined) {
    const configInput = options.config;
    return async () => {
      const raw = typeof configInput === 'function' ? await configInput() : configInput;
      return resolveConnectionConfig(raw);
    };
  }

  // Legacy path: api_key (+ optional ws_base_url)
  const apiKeyConfig = options.api_key!;
  const wsBaseUrl = options.ws_base_url ?? SONIOX_WS_URL;
  return async () => {
    const apiKey = await resolveApiKey(apiKeyConfig);
    return {
      api_key: apiKey,
      api_domain: 'https://api.soniox.com',
      stt_ws_url: wsBaseUrl,
      session_defaults: {},
    };
  };
}
