/**
 * SonioxClient - main entry point for the @soniox/client SDK
 *
 * Provides high-level `record()` for audio capture + transcription,
 * and low-level `stt()` for direct WebSocket session access
 */

import { RealtimeSttSession } from '@soniox/core';
import type { SttSessionConfig, SttSessionOptions } from '@soniox/core';

import { MicrophoneSource } from './audio/microphone.js';
import type { ApiKeyConfig } from './auth.js';
import type { PermissionResolver } from './permissions/types.js';
import type { RecordOptions } from './recording.js';
import { Recording } from './recording.js';

const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

/**
 * Options for creating a SonioxClient instance.
 */
export type SonioxClientOptions = {
  /**
   * API key configuration.
   *
   * - `string` - A pre-fetched temporary API key (e.g., injected from SSR)
   * - `() => Promise<string>` - Async function that fetches a fresh key from your backend
   */
  api_key: ApiKeyConfig;

  /**
   * WebSocket URL for real-time connections.
   * @default 'wss://stt-rt.soniox.com/transcribe-websocket'
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
   *   api_key: fetchKey,
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
 * const client = new SonioxClient({
 *   api_key: async () => {
 *     const res = await fetch('/api/get-temporary-key', { method: 'POST' });
 *     return (await res.json()).api_key;
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
  private readonly apiKeyConfig: ApiKeyConfig;
  private readonly wsBaseUrl: string;
  private readonly permissionResolver: PermissionResolver | undefined;
  private readonly defaultBufferQueueSize: number;
  private readonly defaultSessionOptions: SttSessionOptions | undefined;

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
    this.apiKeyConfig = options.api_key;
    this.wsBaseUrl = options.ws_base_url ?? SONIOX_WS_URL;
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
    const { source, signal, buffer_queue_size, session_options, ...sttConfig } = options;

    const audioSource = source ?? new MicrophoneSource();

    return new Recording(this.apiKeyConfig, this.wsBaseUrl, sttConfig, audioSource, {
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

    return new RealtimeSttSession(options.api_key, this.wsBaseUrl, config, mergedSessionOptions);
  }
}
