import type {
  RealtimeClientOptions,
  SttSessionConfig,
  SttSessionOptions,
} from '../types/public/realtime.js';

import { RealtimeSttSession } from './stt.js';

/**
 * Realtime API factory for creating STT sessions.
 *
 * @example
 * ```typescript
 * const session = client.realtime.stt({
 *   model: 'stt-rt-preview',
 *   enable_endpoint_detection: true,
 * });
 *
 * await session.connect();
 * ```
 */
export class SonioxRealtimeApi {
  private readonly options: RealtimeClientOptions;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  /**
   * Create a new Speech-to-Text session.
   *
   * @param config - Session configuration (sent to server)
   * @param options - Session options (SDK-level settings)
   * @returns New STT session instance
   */
  stt(config: SttSessionConfig, options?: SttSessionOptions): RealtimeSttSession {
    // Merge default options with per-session options
    const mergedOptions: SttSessionOptions = {
      ...this.options.defaultSessionOptions,
      ...options,
    };

    return new RealtimeSttSession(
      this.options.apiKey,
      this.options.wsBaseUrl,
      config,
      mergedOptions
    );
  }
}

// Re-export session class
export { RealtimeSttSession } from './stt.js';

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
} from './errors.js';
