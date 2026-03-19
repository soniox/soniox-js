/**
 * Recording - high-level orchestrator for real-time speech-to-text.
 *
 * Returned by `client.realtime.record()`. Manages the lifecycle of an AudioSource
 * and a RealtimeSttSession, including audio buffering during key fetch/connection.
 */

import { TypedEmitter, RealtimeSttSession, isRetriableError, ConnectionError } from '@soniox/core';
import type {
  RealtimeResult,
  RealtimeToken,
  ResolvedConnectionConfig,
  StateChangeReason,
  SttSessionConfig,
  SttSessionOptions,
} from '@soniox/core';

import type { AudioSource } from './audio/types.js';

const TERMINAL_STATES: readonly RecordingState[] = ['stopped', 'canceled', 'error'];

const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Unified recording lifecycle states.
 */
export type RecordingState =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'recording'
  | 'paused'
  | 'reconnecting'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'canceled';

/**
 * Reconnection configuration for automatic WebSocket recovery.
 */
export type ReconnectOptions = {
  /**
   * Enable automatic reconnection on retriable errors.
   * @default false
   */
  auto_reconnect?: boolean | undefined;

  /**
   * Maximum number of consecutive reconnection attempts before giving up.
   * @default 3
   */
  max_reconnect_attempts?: number | undefined;

  /**
   * Base delay in milliseconds for exponential backoff (1x, 2x, 4x, ...).
   * @default 1000
   */
  reconnect_base_delay_ms?: number | undefined;

  /**
   * When true, clear accumulated transcript state (finalText, segments,
   * utterances) on reconnect. Window-tracking state is always reset.
   * @default false
   */
  reset_transcript_on_reconnect?: boolean | undefined;
};

/**
 * Payload for the `reconnecting` event.
 */
export type ReconnectingEvent = {
  /** Current attempt number (1-based). */
  attempt: number;
  /** Maximum attempts configured. */
  max_attempts: number;
  /** Backoff delay before reconnect (ms). */
  delay_ms: number;
  /** Call to cancel this reconnection attempt. */
  preventDefault: () => void;
};

/**
 * Events emitted by a Recording instance
 */
export type RecordingEvents = {
  /** Parsed result received from the server. */
  result: (result: RealtimeResult) => void;

  /** Individual token received. */
  token: (token: RealtimeToken) => void;

  /** Error occurred during recording. */
  error: (error: Error) => void;

  /** Endpoint detected (speaker finished talking). */
  endpoint: () => void;

  /** Finalization complete. */
  finalized: () => void;

  /** Recording finished (server acknowledged end of stream). */
  finished: () => void;

  /** WebSocket connected and ready. */
  connected: () => void;

  /** Recording state transition. */
  state_change: (update: { old_state: RecordingState; new_state: RecordingState; reason?: StateChangeReason }) => void;

  /** About to attempt a reconnection. Call `preventDefault()` to cancel. */
  reconnecting: (event: ReconnectingEvent) => void;

  /** Successfully reconnected after a drop. */
  reconnected: (event: { attempt: number }) => void;

  /**
   * New STT session started (initial or after reconnect).
   * Consumers should reset any session-local tracking state (e.g. token
   * window comparisons). The `reset_transcript` flag indicates whether
   * accumulated transcript state should also be cleared.
   */
  session_restart: (event: { reset_transcript: boolean }) => void;

  /** Audio source was muted externally (e.g. OS-level or hardware mute). */
  source_muted: () => void;

  /** Audio source was unmuted after an external mute. */
  source_unmuted: () => void;
};

/**
 * Options for creating a recording
 */
export type RecordOptions = SttSessionConfig &
  ReconnectOptions & {
    /**
     * Audio source to use. Defaults to MicrophoneSource if not provided.
     */
    source?: AudioSource | undefined;

    /**
     * AbortSignal for cancellation
     */
    signal?: AbortSignal | undefined;

    /**
     * Maximum number of audio chunks to buffer while waiting for key/connection
     * @default 1000
     */
    buffer_queue_size?: number | undefined;

    /**
     * SDK-level session options (signal, etc.)
     */
    session_options?: SttSessionOptions | undefined;

    /**
     * Function that receives the resolved connection config (including
     * `session_defaults` from the server) and returns the final session config.
     *
     * When provided, its return value is used as the session config,
     * and any flat session config fields on this object are ignored.
     *
     * @example
     * ```typescript
     * client.realtime.record({
     *   session_config: (resolved) => ({
     *     ...resolved.session_defaults,
     *     enable_endpoint_detection: true,
     *   }),
     * });
     * ```
     */
    session_config?: ((resolved: ResolvedConnectionConfig) => SttSessionConfig) | undefined;
  };

const DEFAULT_BUFFER_QUEUE_SIZE = 1000;

/**
 * High-level recording orchestrator
 *
 * Manages the lifecycle of audio capture and real-time transcription:
 * 1. Starts audio source immediately (buffers chunks)
 * 2. Resolves connection config (API key + URLs, sync or async)
 * 3. Connects to the Soniox WebSocket API
 * 4. Drains buffered audio, then pipes live audio to the session
 *
 * @example
 * ```typescript
 * const recording = client.realtime.record({ model: 'stt-rt-v4' });
 * recording.on('result', (r) => console.log(r.tokens));
 * recording.on('error', (e) => console.error(e));
 *
 * // Later:
 * await recording.stop();
 * ```
 */
/** @internal */
export type SttConfigInput = SttSessionConfig | ((resolved: ResolvedConnectionConfig) => SttSessionConfig);

export class Recording {
  private readonly emitter = new TypedEmitter<RecordingEvents>();
  private readonly configResolver: () => Promise<ResolvedConnectionConfig>;
  private readonly sttConfigInput: SttConfigInput;
  private readonly sessionOptions: SttSessionOptions | undefined;
  private readonly source: AudioSource;
  private readonly maxBufferSize: number;
  private readonly signal: AbortSignal | undefined;

  // Reconnect config
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelay: number;
  private readonly resetTranscriptOnReconnect: boolean;

  private session: RealtimeSttSession | null = null;
  private audioBuffer: ArrayBuffer[] = [];
  private _state: RecordingState = 'idle';
  private isBuffering = true;
  private _isSourceMuted = false;
  private _reconnectAttempt = 0;

  // Stop promise handling
  private stopResolver: (() => void) | null = null;
  private stopRejecter: ((error: Error) => void) | null = null;

  /** @internal */
  constructor(
    configResolver: () => Promise<ResolvedConnectionConfig>,
    sttConfigInput: SttConfigInput,
    source: AudioSource,
    options?: {
      buffer_queue_size?: number;
      session_options?: SttSessionOptions;
      signal?: AbortSignal;
      auto_reconnect?: boolean;
      max_reconnect_attempts?: number;
      reconnect_base_delay_ms?: number;
      reset_transcript_on_reconnect?: boolean;
    }
  ) {
    this.configResolver = configResolver;
    this.sttConfigInput = sttConfigInput;
    this.source = source;
    this.maxBufferSize = options?.buffer_queue_size ?? DEFAULT_BUFFER_QUEUE_SIZE;
    this.sessionOptions = options?.session_options;
    this.signal = options?.signal;
    this.autoReconnect = options?.auto_reconnect ?? false;
    this.maxReconnectAttempts = options?.max_reconnect_attempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.reconnectBaseDelay = options?.reconnect_base_delay_ms ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    this.resetTranscriptOnReconnect = options?.reset_transcript_on_reconnect ?? false;

    // Start the async lifecycle on the next microtask so callers can attach listeners first
    queueMicrotask(() => {
      void this.run();
    });
  }

  /**
   * Current recording state
   */
  get state(): RecordingState {
    return this._state;
  }

  /**
   * Register an event handler
   */
  on<E extends keyof RecordingEvents>(event: E, handler: RecordingEvents[E]): this {
    this.emitter.on(event, handler);
    return this;
  }

  /**
   * Register a one-time event handler
   */
  once<E extends keyof RecordingEvents>(event: E, handler: RecordingEvents[E]): this {
    this.emitter.once(event, handler);
    return this;
  }

  /**
   * Remove an event handler
   */
  off<E extends keyof RecordingEvents>(event: E, handler: RecordingEvents[E]): this {
    this.emitter.off(event, handler);
    return this;
  }

  /**
   * Gracefully stop recording
   *
   * Stops the audio source and waits for the server to process all
   * buffered audio and return final results.
   *
   * @returns Promise that resolves when the server acknowledges completion
   */
  async stop(): Promise<void> {
    if (this._state === 'stopped' || this._state === 'canceled' || this._state === 'error') {
      return;
    }

    if (this._state === 'stopping') {
      // Already stopping, return existing promise
      return new Promise<void>((resolve, reject) => {
        this.once('finished', resolve);
        this.once('error', reject);
      });
    }

    this.setState('stopping', 'user_action');
    this.source.stop();

    if (this.session && this.session.state === 'connected') {
      const finishPromise = new Promise<void>((resolve, reject) => {
        this.stopResolver = resolve;
        this.stopRejecter = reject;
      });

      try {
        await this.session.finish();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.settleStop(error);
        this.cleanup('error', 'error');
        return;
      }

      return finishPromise;
    }

    return new Promise<void>((resolve, reject) => {
      this.stopResolver = resolve;
      this.stopRejecter = reject;
    });
  }

  /**
   * Immediately cancel recording without waiting for final results
   */
  cancel(): void {
    if (this._state === 'stopped' || this._state === 'canceled' || this._state === 'error') {
      return;
    }

    this.source.stop();
    this.session?.close();
    this.cleanup('canceled', 'user_action');
  }

  /**
   * Request the server to finalize current non-final tokens.
   */
  finalize(options?: { trailing_silence_ms?: number }): void {
    this.session?.finalize(options);
  }

  /**
   * Pause recording.
   *
   * Pauses the audio source (stops microphone capture) and pauses the
   * session (activates automatic keepalive to prevent server disconnect).
   */
  pause(): void {
    if (this._state !== 'recording') return;
    this.source.pause?.();
    this.session?.pause();
    this.setState('paused', 'user_action');
  }

  /**
   * Resume recording after pause.
   *
   * Resumes the audio source and session. Audio capture and transmission
   * continue from where they left off. If audio was buffered during a
   * reconnect while paused, the buffer is drained now.
   */
  resume(): void {
    if (this._state !== 'paused') return;
    this.source.resume?.();
    if (!this._isSourceMuted) {
      this.session?.resume();
    }
    this.setState('recording', 'user_action');

    // Drain any audio buffered during a reconnect that completed while paused.
    if (this.isBuffering && this.session) {
      this.isBuffering = false;
      for (const chunk of this.audioBuffer) {
        if (this.isTerminalState()) break;
        this.session.sendAudio(chunk);
      }
      this.audioBuffer = [];
    }
  }

  /**
   * @internal Debug-only: simulate an unexpected network disconnection.
   * Tears down the current session and feeds a retriable error into the
   * error handler so the reconnection logic kicks in exactly as it would
   * during a real connection drop.
   */
  __debugForceDisconnect(): void {
    if (this._state !== 'recording' && this._state !== 'paused') return;
    this.session?.close();
    this.session = null;
    this.handleError(new ConnectionError('Debug: simulated disconnect'));
  }

  private async run(): Promise<void> {
    // Check abort before starting
    if (this.signal?.aborted) {
      this.handleAbort();
      return;
    }

    const onAbort = () => this.handleAbort();
    this.signal?.addEventListener('abort', onAbort, { once: true });

    this.setState('starting', 'user_action');

    try {
      // Start audio source (begins buffering)
      await this.source.start({
        onData: (chunk) => this.handleAudioData(chunk),
        onError: (err) => this.handleError(err),
        onMuted: () => this.handleSourceMuted(),
        onUnmuted: () => this.handleSourceUnmuted(),
      });
    } catch (error) {
      this.signal?.removeEventListener('abort', onAbort);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Check if aborted/stopped during source startup
    if (this.isTerminalState()) {
      this.signal?.removeEventListener('abort', onAbort);
      return;
    }

    // Resolve connection config (API key + URLs)
    let resolvedConfig: ResolvedConnectionConfig;
    try {
      resolvedConfig = await this.configResolver();
    } catch (error) {
      this.signal?.removeEventListener('abort', onAbort);
      this.source.stop();
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Remove startup abort listener
    this.signal?.removeEventListener('abort', onAbort);

    // Check if cancelled/stopped during config resolution
    if (this.isTerminalState()) {
      this.source.stop();
      return;
    }

    // Resolve session config (may depend on server-provided session_defaults)
    const sttConfig =
      typeof this.sttConfigInput === 'function' ? this.sttConfigInput(resolvedConfig) : this.sttConfigInput;

    // Create session and connect
    this.setState('connecting', 'user_action');

    const sessionOptions: SttSessionOptions = {
      ...this.sessionOptions,
    };
    if (this.signal !== undefined) {
      sessionOptions.signal = this.signal;
    }

    const session = new RealtimeSttSession(
      resolvedConfig.api_key,
      resolvedConfig.stt_ws_url,
      sttConfig,
      sessionOptions
    );
    this.session = session;

    // Wire up session events
    this.wireSessionEvents(session);

    try {
      await session.connect();
    } catch (error) {
      this.source.stop();
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Check if cancelled/errored during connect - close the session
    if (this.isTerminalState()) {
      session.close();
      return;
    }

    const stoppingEarly = this._state === 'stopping';

    // Drain buffered audio and switch to live mode
    if (!stoppingEarly) {
      this.setState('recording', 'connected');
      this.emitter.emit('connected');
    }

    this.isBuffering = false;
    for (const chunk of this.audioBuffer) {
      if (this._state !== 'recording' && this._state !== 'stopping') {
        break;
      }
      session.sendAudio(chunk);
    }
    this.audioBuffer = [];

    // If stop() was called before connection was established, finish the
    // session now so the server processes all buffered audio
    if (stoppingEarly) {
      try {
        await session.finish();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.settleStop(error);
        this.cleanup('error', 'error');
      }
      // The 'finished' event handler will settle the stop promise and clean up.
    }
  }

  private handleAudioData(chunk: ArrayBuffer): void {
    if (this.isBuffering) {
      if (this.audioBuffer.length >= this.maxBufferSize) {
        this.audioBuffer.shift();
      }
      this.audioBuffer.push(chunk);
      return;
    }

    if (this.session && (this._state === 'recording' || this._state === 'stopping')) {
      try {
        this.session.sendAudio(chunk);
      } catch {
        // Errors are handled via session event proxying
      }
    }
  }

  private handleSourceMuted(): void {
    if (!this.isMuteTrackingState()) return;
    this._isSourceMuted = true;
    // Only toggle session keepalive when in recording state.
    // When paused/reconnecting/connecting, session is already paused or absent.
    if (this._state === 'recording') {
      this.session?.pause();
    }
    this.emitter.emit('source_muted');
  }

  private handleSourceUnmuted(): void {
    if (!this.isMuteTrackingState()) return;
    this._isSourceMuted = false;
    // Only resume session when in recording state.
    // When paused, user pause takes precedence — don't resume.
    if (this._state === 'recording') {
      this.session?.resume();
    }
    this.emitter.emit('source_unmuted');
  }

  private isMuteTrackingState(): boolean {
    const s = this._state;
    return s === 'recording' || s === 'paused' || s === 'reconnecting' || s === 'connecting';
  }

  private wireSessionEvents(session: RealtimeSttSession): void {
    session.on('result', (result) => this.emitter.emit('result', result));
    session.on('token', (token) => this.emitter.emit('token', token));
    session.on('endpoint', () => this.emitter.emit('endpoint'));
    session.on('finalized', () => this.emitter.emit('finalized'));

    session.on('finished', () => {
      this.source.stop();
      this.emitter.emit('finished');
      this.settleStop();
      this.cleanup('stopped', 'finished');
    });

    session.on('error', (error) => {
      this.handleError(error);
    });
  }

  private handleAbort(): void {
    if (this.isTerminalState()) {
      return;
    }

    this.source.stop();
    this.session?.close();
    const error = new Error('Recording aborted');
    this.emitter.emit('error', error);
    this.settleStop(error);
    this.cleanup('canceled', 'user_action');
  }

  private handleError(error: Error): void {
    if (this._state === 'error' || this._state === 'stopped' || this._state === 'canceled') {
      return;
    }

    if (this.shouldReconnect(error)) {
      void this.attemptReconnect(error);
      return;
    }

    this.source.stop();
    this.session?.close();
    this.emitter.emit('error', error);
    this.settleStop(error);
    this.cleanup('error', 'error');
  }

  private shouldReconnect(error: Error): boolean {
    if (!this.autoReconnect) return false;
    if (this._state === 'stopping') return false;
    if (this._state === 'reconnecting') return false;
    if (this._reconnectAttempt >= this.maxReconnectAttempts) return false;
    return isRetriableError(error);
  }

  private async attemptReconnect(triggerError: Error): Promise<void> {
    // Capture pause state before we change recording state.
    // Mute state is read later (at restoration time) so hardware
    // mute/unmute that occurs during backoff is not lost.
    const wasPaused = this._state === 'paused';

    // Tear down old session (but NOT the audio source).
    this.session?.close();
    this.session = null;

    // Switch to buffering mode — audio source keeps running.
    this.isBuffering = true;
    this.audioBuffer = [];

    this._reconnectAttempt++;
    this.setState('reconnecting', 'connection_lost');

    const delay = this.reconnectBaseDelay * Math.pow(2, this._reconnectAttempt - 1);

    // Emit reconnecting event with preventDefault support.
    let prevented = false;
    this.emitter.emit('reconnecting', {
      attempt: this._reconnectAttempt,
      max_attempts: this.maxReconnectAttempts,
      delay_ms: delay,
      preventDefault: () => {
        prevented = true;
      },
    });

    if (prevented) {
      this.source.stop();
      this.emitter.emit('error', triggerError);
      this.settleStop(triggerError);
      this.cleanup('error', 'error');
      return;
    }

    // Wait backoff delay.
    await new Promise((r) => setTimeout(r, delay));

    if (this.shouldAbortReconnect()) return;

    // Re-resolve config (fresh API key).
    let resolvedConfig: ResolvedConnectionConfig;
    try {
      resolvedConfig = await this.configResolver();
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (this.shouldAbortReconnect()) return;

    const sttConfig =
      typeof this.sttConfigInput === 'function' ? this.sttConfigInput(resolvedConfig) : this.sttConfigInput;

    this.setState('connecting', 'reconnecting');

    const sessionOptions: SttSessionOptions = {
      ...this.sessionOptions,
    };
    if (this.signal !== undefined) {
      sessionOptions.signal = this.signal;
    }

    const session = new RealtimeSttSession(
      resolvedConfig.api_key,
      resolvedConfig.stt_ws_url,
      sttConfig,
      sessionOptions
    );
    this.session = session;
    this.wireSessionEvents(session);

    try {
      await session.connect();
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (this.shouldAbortReconnect()) return;

    // Signal store to reset window-tracking state before new results arrive.
    this.emitter.emit('session_restart', { reset_transcript: this.resetTranscriptOnReconnect });

    // Discard buffered audio — it contains continuation chunks from
    // the old encoder stream and lacks the container header the new
    // server session needs to initialize its decoder.
    this.audioBuffer = [];

    // Reinitialize the audio encoder so subsequent chunks carry a fresh
    // container header. Sources that produce a header-less format (raw PCM)
    // can omit restart().
    this.source.restart?.();

    // Read mute state at restoration time so hardware changes during
    // backoff / connect are not lost.
    const currentlyMuted = this._isSourceMuted;

    // Restore pause/mute state on the new session.
    if (wasPaused || currentlyMuted) {
      session.pause();
    }

    if (wasPaused) {
      // Restore paused state — do NOT drain buffer yet.
      this.source.pause?.();
      this.setState('paused', 'reconnected');
    } else {
      this.setState('recording', 'reconnected');
      this.isBuffering = false;
      this.audioBuffer = [];
    }

    this.emitter.emit('connected');
    this.emitter.emit('reconnected', { attempt: this._reconnectAttempt });
    this._reconnectAttempt = 0;
  }

  /**
   * Check whether an in-flight reconnect should be aborted.
   * Handles both terminal states and a pending stop() request.
   */
  private shouldAbortReconnect(): boolean {
    if (this.isTerminalState()) return true;
    if (this._state === 'stopping') {
      this.settleStop();
      this.cleanup('stopped', 'user_action');
      return true;
    }
    return false;
  }

  private cleanup(finalState: RecordingState, reason?: StateChangeReason): void {
    this.setState(finalState, reason);
    this.audioBuffer = [];
    this.isBuffering = false;
    this._isSourceMuted = false;
    this._reconnectAttempt = 0;
  }

  private setState(newState: RecordingState, reason?: StateChangeReason): void {
    if (this._state === newState) {
      return;
    }
    const oldState = this._state;
    this._state = newState;
    const update: { old_state: RecordingState; new_state: RecordingState; reason?: StateChangeReason } = {
      old_state: oldState,
      new_state: newState,
    };
    if (reason !== undefined) {
      update.reason = reason;
    }
    this.emitter.emit('state_change', update);
  }

  private isTerminalState(): boolean {
    return TERMINAL_STATES.includes(this._state);
  }

  private settleStop(error?: Error): void {
    const resolve = this.stopResolver;
    const reject = this.stopRejecter;
    this.stopResolver = null;
    this.stopRejecter = null;

    if (error) {
      reject?.(error);
    } else {
      resolve?.();
    }
  }
}
