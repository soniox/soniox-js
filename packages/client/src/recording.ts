/**
 * Recording - high-level orchestrator for real-time speech-to-text.
 *
 * Returned by `client.realtime.record()`. Manages the lifecycle of an AudioSource
 * and a RealtimeSttSession, including audio buffering during key fetch/connection.
 */

import { TypedEmitter, RealtimeSttSession } from '@soniox/core';
import type { RealtimeResult, RealtimeToken, SttSessionConfig, SttSessionOptions } from '@soniox/core';

import type { AudioSource } from './audio/types.js';
import type { ApiKeyConfig } from './auth.js';
import { resolveApiKey } from './auth.js';

const TERMINAL_STATES: readonly RecordingState[] = ['stopped', 'canceled', 'error'];

/**
 * Unified recording lifecycle states.
 */
export type RecordingState =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'canceled';

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
  state_change: (update: { old_state: RecordingState; new_state: RecordingState }) => void;

  /** Audio source was muted externally (e.g. OS-level or hardware mute). */
  source_muted: () => void;

  /** Audio source was unmuted after an external mute. */
  source_unmuted: () => void;
};

/**
 * Options for creating a recording
 */
export type RecordOptions = SttSessionConfig & {
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
};

const DEFAULT_BUFFER_QUEUE_SIZE = 1000;

/**
 * High-level recording orchestrator
 *
 * Manages the lifecycle of audio capture and real-time transcription:
 * 1. Starts audio source immediately (buffers chunks)
 * 2. Resolves the API key (from string or async function)
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
export class Recording {
  private readonly emitter = new TypedEmitter<RecordingEvents>();
  private readonly apiKeyConfig: ApiKeyConfig;
  private readonly wsBaseUrl: string;
  private readonly sttConfig: SttSessionConfig;
  private readonly sessionOptions: SttSessionOptions | undefined;
  private readonly source: AudioSource;
  private readonly maxBufferSize: number;
  private readonly signal: AbortSignal | undefined;

  private session: RealtimeSttSession | null = null;
  private audioBuffer: ArrayBuffer[] = [];
  private _state: RecordingState = 'idle';
  private isBuffering = true;
  private _isSourceMuted = false;

  // Stop promise handling
  private stopResolver: (() => void) | null = null;
  private stopRejecter: ((error: Error) => void) | null = null;

  /** @internal */
  constructor(
    apiKeyConfig: ApiKeyConfig,
    wsBaseUrl: string,
    sttConfig: SttSessionConfig,
    source: AudioSource,
    options?: {
      buffer_queue_size?: number;
      session_options?: SttSessionOptions;
      signal?: AbortSignal;
    }
  ) {
    this.apiKeyConfig = apiKeyConfig;
    this.wsBaseUrl = wsBaseUrl;
    this.sttConfig = sttConfig;
    this.source = source;
    this.maxBufferSize = options?.buffer_queue_size ?? DEFAULT_BUFFER_QUEUE_SIZE;
    this.sessionOptions = options?.session_options;
    this.signal = options?.signal;

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

    this.setState('stopping');
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
        this.cleanup('error');
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
    this.cleanup('canceled');
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
    this.setState('paused');
  }

  /**
   * Resume recording after pause.
   *
   * Resumes the audio source and session. Audio capture and transmission
   * continue from where they left off.
   */
  resume(): void {
    if (this._state !== 'paused') return;
    this.source.resume?.();
    // Keep session paused (keepalive active) if the source is still muted
    // externally — no audio will flow anyway.  handleSourceUnmuted() will
    // resume the session when the mic comes back.
    if (!this._isSourceMuted) {
      this.session?.resume();
    }
    this.setState('recording');
  }

  private async run(): Promise<void> {
    // Check abort before starting
    if (this.signal?.aborted) {
      this.handleAbort();
      return;
    }

    const onAbort = () => this.handleAbort();
    this.signal?.addEventListener('abort', onAbort, { once: true });

    this.setState('starting');

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

    // Resolve API key
    let apiKey: string;
    try {
      apiKey = await resolveApiKey(this.apiKeyConfig);
    } catch (error) {
      this.signal?.removeEventListener('abort', onAbort);
      this.source.stop();
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Remove startup abort listener
    this.signal?.removeEventListener('abort', onAbort);

    // Check if cancelled/stopped during key fetch
    if (this.isTerminalState()) {
      this.source.stop();
      return;
    }

    // Create session and connect
    this.setState('connecting');

    const sessionOptions: SttSessionOptions = {
      ...this.sessionOptions,
    };
    if (this.signal !== undefined) {
      sessionOptions.signal = this.signal;
    }

    const session = new RealtimeSttSession(apiKey, this.wsBaseUrl, this.sttConfig, sessionOptions);
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
      this.setState('recording');
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
        this.cleanup('error');
      }
      // The 'finished' event handler will settle the stop promise and clean up.
    }
  }

  private handleAudioData(chunk: ArrayBuffer): void {
    if (this.isBuffering) {
      if (this.audioBuffer.length >= this.maxBufferSize) {
        this.handleError(new Error('Audio buffer queue size exceeded before connection was established'));
        return;
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
    if (this._state !== 'recording' && this._state !== 'paused') return;
    this._isSourceMuted = true;
    // Only toggle session keepalive when in recording state.
    // When paused, session is already paused (keepalive already active).
    if (this._state === 'recording') {
      this.session?.pause();
    }
    this.emitter.emit('source_muted');
  }

  private handleSourceUnmuted(): void {
    if (this._state !== 'recording' && this._state !== 'paused') return;
    this._isSourceMuted = false;
    // Only resume session when in recording state.
    // When paused, user pause takes precedence — don't resume.
    if (this._state === 'recording') {
      this.session?.resume();
    }
    this.emitter.emit('source_unmuted');
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
      this.cleanup('stopped');
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
    this.cleanup('canceled');
  }

  private handleError(error: Error): void {
    if (this._state === 'error' || this._state === 'stopped' || this._state === 'canceled') {
      return;
    }

    this.source.stop();
    // Close the session if it exists
    this.session?.close();
    this.emitter.emit('error', error);
    this.settleStop(error);
    this.cleanup('error');
  }

  private cleanup(finalState: RecordingState): void {
    this.setState(finalState);
    this.audioBuffer = [];
    this.isBuffering = false;
    this._isSourceMuted = false;
  }

  private setState(newState: RecordingState): void {
    if (this._state === newState) {
      return;
    }
    const oldState = this._state;
    this._state = newState;
    this.emitter.emit('state_change', { old_state: oldState, new_state: newState });
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
