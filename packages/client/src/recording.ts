/**
 * Recording - high-level orchestrator for real-time speech-to-text.
 *
 * Returned by `client.realtime.record()`. Manages the lifecycle of an AudioSource
 * and a RealtimeSttSession, including audio buffering during key fetch/connection.
 */

import { TypedEmitter, RealtimeSttSession, isRetriableError, ConnectionError } from '@soniox/core';
import type {
  ConfigContext,
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
   * Recover from a dropped connection instead of ending the recording.
   *
   * The recording first tries to continue the same stream, by asking for
   * [stream reconnect](https://soniox.com/docs/stt/rt/stream-reconnect) in the
   * start request (unless `enable_reconnect` is set explicitly): when the
   * server grants it, a drop is repaired underneath - one transcript, the same
   * speakers, one bill - and `reconnected` says `resumed: true`. Starting a
   * fresh session is the fallback, for a stream that cannot be continued; it
   * leaves a gap in the transcript and says `resumed: false`.
   *
   * Without this option, setting `enable_reconnect: true` still continues
   * the same stream after a drop, but a lost stream ends the recording.
   *
   * @default false
   */
  auto_reconnect?: boolean | undefined;

  /**
   * Maximum number of consecutive fresh sessions to start before giving up.
   *
   * Continuing the same stream does not count against this: it is bounded by
   * the stream's own reconnect window instead, which the server sets with
   * `idle_timeout_ms`.
   *
   * @default 3
   */
  max_reconnect_attempts?: number | undefined;

  /**
   * Base delay in milliseconds for exponential backoff (1x, 2x, 4x, ...)
   * before starting a fresh session.
   *
   * It does not pace continuing the same stream, which has the stream's
   * reconnect window to get back in and spends it on its own schedule.
   *
   * @default 1000
   */
  reconnect_base_delay_ms?: number | undefined;

  /**
   * When true, clear accumulated transcript state (finalText, segments,
   * utterances) when a fresh session starts. Window-tracking state is always
   * reset.
   *
   * It has nothing to clear when the same stream continued: that transcript
   * is still the stream's own.
   *
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

  /**
   * Recovered from a drop. `resumed` is true when the same stream continued,
   * and false when a fresh session took over; `attempt` counts the fresh
   * sessions it took, so it is 0 on a resumed stream.
   */
  reconnected: (event: { attempt: number; resumed: boolean }) => void;

  /**
   * New STT session started (initial or after a fresh session replaced a
   * dropped one; never when the same stream continued).
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
     * `stt_defaults` from the server) and returns the final session config.
     *
     * When provided, its return value is used as the session config,
     * and any flat session config fields on this object are ignored.
     *
     * @example
     * ```typescript
     * client.realtime.record({
     *   session_config: (resolved) => ({
     *     ...resolved.stt_defaults,
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
 * const recording = client.realtime.record({ model: 'stt-rt-v6' });
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
  private readonly configResolver: (context?: ConfigContext) => Promise<ResolvedConnectionConfig>;
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
  private stopPromise: Promise<void> | null = null;

  /** @internal */
  constructor(
    configResolver: (context?: ConfigContext) => Promise<ResolvedConnectionConfig>,
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
      if (this.stopPromise) {
        return this.stopPromise;
      }
      return new Promise<void>((resolve, reject) => {
        this.once('finished', resolve);
        this.once('error', reject);
      });
    }

    this.setState('stopping', 'user_action');
    this.source.stop();

    if (this.session && this.session.state === 'connected') {
      const finishPromise = this.createStopPromise();

      try {
        await this.session.finish();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.settleStop(error);
        // cancel() or a session error may already have moved to a terminal state.
        if (!this.isTerminalState()) {
          this.cleanup('error', 'error');
        }
        return;
      }

      return finishPromise;
    }

    // Session not yet created or still mid-connect — run() or
    // shouldAbortReconnect() will detect 'stopping' and settle.
    const sessionPending = !this.session || this.session.state === 'idle' || this.session.state === 'connecting';
    if (sessionPending) {
      return this.createStopPromise();
    }

    // Session is in a terminal state (closed/error/finished/canceled) —
    // nothing will settle a deferred promise, so resolve immediately.
    this.session?.close();
    this.settleStop();
    this.cleanup('stopped', 'user_action');
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
    this.settleStop();
    this.cleanup('canceled', 'user_action');
  }

  /**
   * Request the server to finalize current non-final tokens.
   */
  finalize(options?: { trailing_silence_ms?: number }): void {
    this.session?.finalize(options);
  }

  /**
   * Send what your agent is saying, so those words are recognized when the user
   * says them back and the agent's own voice is not transcribed as the user.
   *
   * Requires `enable_agent_text_input` on the recording config. Send each piece
   * a little before the caller hears it - 500ms to 1s ahead of playback - since
   * the server places it by where it sits among the audio frames. Close every
   * turn with `end_of_segment: true`, which is also how a barge-in is handled.
   *
   * Dropped while no session is connected - before the connection opens, or
   * while a fresh session replaces a dropped one - because text sent then
   * would land beside the wrong audio rather than where it belongs. A stream
   * that is being taken over keeps its session, so the text is kept with the
   * audio around it and goes out in order.
   */
  sendAgentText(text: string, options?: { end_of_segment?: boolean }): void {
    if (this.session?.state !== 'connected') return;
    this.session.sendAgentText(text, options);
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
   * @internal Debug-only: force a fresh session. It closes the current one,
   * which ends the stream, and feeds a retriable error into the error handler,
   * so it exercises the fallback path and not a drop. For a drop - which the
   * stream is continued through - use the session's
   * `__debugForceDisconnect()`.
   */
  __debugForceSessionRestart(): void {
    if (this._state !== 'recording' && this._state !== 'paused') return;
    this.session?.close();
    this.session = null;
    this.handleError(new ConnectionError('Debug: simulated disconnect'));
  }

  /**
   * Recover from a connection that may be stale.
   *
   * Use this after platform lifecycle events such as laptop sleep/wake (web
   * `visibilitychange`) or app backgrounding (React Native `AppState`).
   *
   * It first moves the same stream to a new connection, which keeps the
   * transcript whole and reports `reconnected` with `resumed: true`. When the
   * stream cannot be continued - its reconnect window has passed, or the
   * server refuses - and `auto_reconnect` is on, it falls back to a fresh
   * session (backoff, config re-resolution, buffer drain), which leaves a gap
   * in the transcript and reports `resumed: false`.
   *
   * No-op when the recording is not in `recording` or `paused` state, or when
   * the stream cannot be continued and `auto_reconnect` is off.
   */
  reconnect(): void {
    if (this._state !== 'recording' && this._state !== 'paused') return;
    if (this.session?.resumeStream()) return;
    if (!this.autoReconnect) return;
    this.session?.close();
    this.session = null;
    this.handleError(new ConnectionError('Reconnect requested'));
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

    // Resolve session config (may depend on server-provided stt_defaults)
    const sttConfig = this.sessionConfig(resolvedConfig);

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
      // A browser WebSocket cannot set headers; the key rides in the subprotocol.
      { auth_transport: 'protocol-list', ...sessionOptions }
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
        if (!this.isTerminalState()) {
          this.cleanup('error', 'error');
        }
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

  /**
   * Build the session config for a new session.
   * `auto_reconnect` prefers continuing the same stream, so the start request
   * has to ask the server for a reconnect token unless the caller opted out.
   */
  private sessionConfig(resolvedConfig: ResolvedConnectionConfig): SttSessionConfig {
    const config =
      typeof this.sttConfigInput === 'function' ? this.sttConfigInput(resolvedConfig) : this.sttConfigInput;

    if (!this.autoReconnect || config.enable_reconnect !== undefined) {
      return config;
    }
    return { ...config, enable_reconnect: true };
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

    session.on('resuming', () => {
      // The session is repairing the drop itself, so nothing restarts here and no
      // fresh-session attempt is spent - and there is nothing left to prevent
      this.emitter.emit('reconnecting', {
        attempt: 0,
        max_attempts: this.maxReconnectAttempts,
        delay_ms: 0,
        preventDefault: () => undefined,
      });
    });

    session.on('resumed', () => {
      // The session repaired the drop itself: no fresh session was spent
      this.emitter.emit('reconnected', { attempt: 0, resumed: true });
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

    // Reinitialize the audio encoder immediately so audio captured
    // during the reconnect window carries fresh container headers and
    // can be drained to the new session. Skip when paused — the
    // source isn't producing data, and we'll restart after connect.
    if (!wasPaused) {
      this.source.restart?.();
    }

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

    const sttConfig = this.sessionConfig(resolvedConfig);

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
      // A browser WebSocket cannot set headers; the key rides in the subprotocol.
      { auth_transport: 'protocol-list', ...sessionOptions }
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

    // Read mute state at restoration time so hardware changes during
    // backoff / connect are not lost.
    const currentlyMuted = this._isSourceMuted;

    // Restore pause/mute state on the new session.
    if (wasPaused || currentlyMuted) {
      session.pause();
    }

    if (wasPaused) {
      // Restart encoder now (was skipped above since source was paused)
      // and immediately re-pause so resume() can drain later.
      this.source.restart?.();
      this.source.pause?.();
      this.setState('paused', 'reconnected');
    } else {
      this.setState('recording', 'reconnected');
      // Drain audio buffered during the reconnect window. The encoder
      // was restarted early so these chunks carry fresh container headers.
      this.isBuffering = false;
      for (const chunk of this.audioBuffer) {
        if (this.isTerminalState()) break;
        session.sendAudio(chunk);
      }
      this.audioBuffer = [];
    }

    this.emitter.emit('connected');
    this.emitter.emit('reconnected', { attempt: this._reconnectAttempt, resumed: false });
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

  private createStopPromise(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.stopResolver = resolve;
      this.stopRejecter = reject;
    });
    // The same failure is reported through the `error` event, and the drain path
    // may never hand this promise to the caller, so keep it from going unhandled.
    promise.catch(() => {});
    this.stopPromise = promise;
    return promise;
  }

  private settleStop(error?: Error): void {
    const resolve = this.stopResolver;
    const reject = this.stopRejecter;
    this.stopResolver = null;
    this.stopRejecter = null;
    this.stopPromise = null;

    if (error) {
      reject?.(error);
    } else {
      resolve?.();
    }
  }
}
