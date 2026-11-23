import type {
  AudioData,
  RealtimeEvent,
  RealtimeResult,
  RealtimeStreamFrame,
  RealtimeToken,
  AuthTransport,
  SendStreamOptions,
  StateChangeReason,
  SttSessionConfig,
  SttSessionEvents,
  SttSessionOptions,
  SttSessionState,
} from '../types/realtime.js';

import { AsyncEventQueue } from './async-queue.js';
import { handshakeAuthArg } from './auth.js';
import { TypedEmitter } from './emitter.js';
import { AbortError, BadRequestError, ConnectionError, StateError, mapErrorResponse } from './errors.js';
import {
  CLOSE_DIAL_TIMEOUT_MS,
  MAX_RECONNECT_BACKOFF_MS,
  MAX_RESUMES_WITHOUT_A_FRAME,
  MIN_RECONNECT_ATTEMPT_MS,
  MIN_RECONNECT_WAIT_MS,
  PING_INTERVAL_MS,
  RECONNECT_BACKOFF_MS,
  RECONNECT_REPLY_TIMEOUT_MS,
  Reconnect,
} from './reconnect.js';

// Default keepalive interval
const DEFAULT_KEEPALIVE_INTERVAL_MS = 5000;

// Minimum allowed keepalive interval to prevent network flooding
const MIN_KEEPALIVE_INTERVAL_MS = 1000;

// Default timeout for WebSocket connection establishment
const DEFAULT_CONNECT_TIMEOUT_MS = 20000;

// Default idle timeout, and the reconnect window
const DEFAULT_IDLE_TIMEOUT_MS = 20000;

// 1000 ends the stream; a connection we leave behind gets 4000
const NORMAL_CLOSE_CODE = 1000;
const ABANDONED_CLOSE_CODE = 4000;

/**
 * Convert audio data to Uint8Array
 * Handles Uint8Array and ArrayBuffer
 */
function toUint8Array(data: AudioData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Build the configuration message to send after WebSocket connection
 */
function buildConfigMessage(config: SttSessionConfig): Record<string, unknown> {
  return {
    model: config.model,
    audio_format: config.audio_format ?? 'auto',
    sample_rate: config.sample_rate,
    num_channels: config.num_channels,
    language_hints: config.language_hints,
    language_hints_strict: config.language_hints_strict,
    enable_speaker_diarization: config.enable_speaker_diarization,
    enable_language_identification: config.enable_language_identification,
    enable_endpoint_detection: config.enable_endpoint_detection,
    enable_agent_text_input: config.enable_agent_text_input,
    enable_reconnect: config.enable_reconnect,
    idle_timeout_ms: config.idle_timeout_ms,
    client_reference_id: config.client_reference_id,
    max_endpoint_delay_ms: config.max_endpoint_delay_ms,
    endpoint_sensitivity: config.endpoint_sensitivity,
    endpoint_latency_adjustment_level: config.endpoint_latency_adjustment_level,
    context: config.context,
    translation: config.translation,
  };
}

/**
 * Parse a result message from the WebSocket
 */
function parseResultMessage(raw: Record<string, unknown>): RealtimeResult & { raw: unknown } {
  // Check for error response
  if ('error_code' in raw || 'error_message' in raw) {
    throw mapErrorResponse(raw);
  }

  // Parse tokens
  const rawTokens = (raw.tokens as Array<Record<string, unknown>>) ?? [];
  const tokens: RealtimeToken[] = rawTokens.map((t) => ({
    text: typeof t.text === 'string' ? t.text : '',
    start_ms: typeof t.start_ms === 'number' ? t.start_ms : undefined,
    end_ms: typeof t.end_ms === 'number' ? t.end_ms : undefined,
    confidence: typeof t.confidence === 'number' ? t.confidence : 0,
    is_final: Boolean(t.is_final),
    speaker: typeof t.speaker === 'string' ? t.speaker : undefined,
    language: typeof t.language === 'string' ? t.language : undefined,
    translation_status:
      t.translation_status === 'none' || t.translation_status === 'original' || t.translation_status === 'translation'
        ? t.translation_status
        : undefined,
    source_language: typeof t.source_language === 'string' ? t.source_language : undefined,
  }));

  return {
    tokens,
    final_audio_proc_ms: typeof raw.final_audio_proc_ms === 'number' ? raw.final_audio_proc_ms : 0,
    total_audio_proc_ms: typeof raw.total_audio_proc_ms === 'number' ? raw.total_audio_proc_ms : 0,
    finished: raw.finished === true,
    raw,
  };
}

/**
 * Check if a token is a special control token
 */
function isSpecialToken(text: string): boolean {
  return text === '<end>' || text === '<fin>';
}

/**
 * Filter out special control tokens from tokens array
 */
function filterSpecialTokens(tokens: RealtimeToken[]): RealtimeToken[] {
  return tokens.filter((t) => !isSpecialToken(t.text));
}

/**
 * The HTTP status a refused WebSocket handshake reported
 * Node puts it in the error event's message; a browser is not allowed to see
 * it, so there a refused handshake is retried like any other failed dial
 */
function handshakeStatus(event: Event): number | null {
  const message = (event as { message?: unknown }).message;
  const match = typeof message === 'string' ? /Unexpected server response: (\d{3})/.exec(message) : null;
  return match === null ? null : Number(match[1]);
}

/**
 * What a dial did, and whether dialling again could still continue the stream
 */
type DialOutcome = { resumed: true } | { resumed: false; fatal: boolean; error: ConnectionError };

/**
 * Real-time Speech-to-Text session
 *
 * Provides WebSocket-based streaming transcription with support for:
 * - Event-based and async iterator consumption
 * - Pause/resume with automatic keepalive while paused
 * - AbortSignal cancellation
 *
 * @example
 * ```typescript
 * const session = new RealtimeSttSession(apiKey, wsUrl, { model: 'stt-rt-v6' });
 *
 * session.on('result', (result) => {
 *   console.log(result.tokens.map(t => t.text).join(''));
 * });
 *
 * await session.connect();
 * session.sendAudio(audioChunk);
 * await session.finish();
 * ```
 */
export class RealtimeSttSession implements AsyncIterable<RealtimeEvent> {
  private readonly emitter = new TypedEmitter<SttSessionEvents>();
  private readonly eventQueue = new AsyncEventQueue<RealtimeEvent>();
  private iteratorAttached = false;

  private readonly apiKey: string;
  private readonly wsBaseUrl: string;
  private readonly authTransport: AuthTransport | undefined;
  private readonly config: SttSessionConfig;
  private readonly keepaliveIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly signal: AbortSignal | undefined;

  private ws: WebSocket | null = null;
  private _state: SttSessionState = 'idle';
  private _paused = false;
  private _pauseWarned = false;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * What this stream needs to continue on a new connection, or null when the
   * caller did not ask for reconnect. All the bookkeeping lives in there; what
   * is left out here is this session's own I/O state.
   */
  private readonly reconnect: Reconnect | null;
  private readonly pingIntervalMs: number;
  private readonly reconnectWindowMs: number;
  private streamEnded = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private takingOver = false;
  private dialWs: WebSocket | null = null;

  /** Whether `dialWs` has presented its token, so the server may already hold the stream there. */
  private dialPresented = false;
  private endBackoff: (() => void) | null = null;

  // Finish promise handling
  private finishResolver: (() => void) | null = null;
  private finishRejecter: ((error: Error) => void) | null = null;

  // Abort handler reference for cleanup
  private abortHandler: (() => void) | null = null;

  constructor(apiKey: string, wsBaseUrl: string, config: SttSessionConfig, options?: SttSessionOptions) {
    this.apiKey = apiKey;
    this.wsBaseUrl = wsBaseUrl;
    this.config = config;
    const keepaliveMs = options?.keepalive_interval_ms ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
    this.keepaliveIntervalMs =
      Number.isFinite(keepaliveMs) && keepaliveMs > 0
        ? Math.max(keepaliveMs, MIN_KEEPALIVE_INTERVAL_MS)
        : DEFAULT_KEEPALIVE_INTERVAL_MS;
    const connectMs = options?.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.connectTimeoutMs = Number.isFinite(connectMs) && connectMs > 0 ? connectMs : DEFAULT_CONNECT_TIMEOUT_MS;
    this.signal = options?.signal;
    this.authTransport = options?.auth_transport;

    this.reconnect = config.enable_reconnect === true ? new Reconnect() : null;
    const idleTimeoutMs = config.idle_timeout_ms ?? DEFAULT_IDLE_TIMEOUT_MS;
    // A quarter: ping and pong both fit in the timeout
    this.pingIntervalMs = Math.min(idleTimeoutMs / 4, PING_INTERVAL_MS);
    this.reconnectWindowMs = idleTimeoutMs;

    // Set up abort signal handler (store reference for cleanup)
    if (this.signal) {
      this.abortHandler = () => this.handleAbort();
      this.signal.addEventListener('abort', this.abortHandler);
    }
  }

  /**
   * Current session state.
   */
  get state(): SttSessionState {
    return this._state;
  }

  /**
   * Whether the session is currently paused.
   */
  get paused(): boolean {
    return this._paused;
  }

  /**
   * Connect to the Soniox WebSocket API.
   *
   * @throws {@link AbortError} If aborted
   * @throws {@link ConnectionError} If connection fails
   * @throws {@link StateError} If already connected
   */
  async connect(): Promise<void> {
    if (this._state !== 'idle') {
      throw new StateError(`Cannot connect: session is in "${this._state}" state`);
    }

    this.checkAborted();
    this.setState('connecting', 'user_action');

    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.createWebSocket().then((v) => {
          clearTimeout(connectTimer);
          return v;
        }),
        new Promise<never>((_resolve, reject) => {
          connectTimer = setTimeout(() => {
            if (this.ws) {
              this.ws.close();
            }
            reject(new ConnectionError('Connection timed out'));
          }, this.connectTimeoutMs);
        }),
      ]);
      this.setState('connected', 'connected');
      this.emitter.emit('connected');
      this.updateKeepalive();
      if (this.reconnect !== null) {
        this.reconnect.ackedAt = Date.now();
        this.pingInterval = setInterval(() => this.pingTick(), this.pingIntervalMs);
      }
    } catch (error) {
      clearTimeout(connectTimer);
      if (!this.isTerminalState(this._state)) {
        const err = error instanceof Error ? error : new ConnectionError('Connection failed', error);
        this.cleanup('error', err, 'error');
      }
      throw error;
    }
  }

  /**
   * Send audio data to the server
   *
   * @param data - Audio data as Uint8Array or ArrayBuffer
   * @throws {@link AbortError} If aborted
   * @throws {@link StateError} If not connected
   */
  sendAudio(data: AudioData): void {
    this.checkAborted();

    if (this._state !== 'connected') {
      throw new StateError(`Cannot send audio: session is in "${this._state}" state`);
    }

    // If paused, just drop the audio silently
    if (this._paused) {
      return;
    }

    const chunk = toUint8Array(data);
    this.sendMessage(chunk, true);
  }

  /**
   * Stream audio data from an async iterable source.
   *
   * @param stream - Async iterable yielding audio chunks
   * @param options - Optional pacing and auto-finish settings
   * @throws {@link AbortError} If aborted during streaming
   * @throws {@link StateError} If not connected
   */
  async sendStream(stream: AsyncIterable<AudioData>, options?: SendStreamOptions): Promise<void> {
    for await (const chunk of stream) {
      this.sendAudio(chunk);
      if (options?.pace_ms) {
        await new Promise((resolve) => setTimeout(resolve, options.pace_ms));
      }
    }
    if (options?.finish) {
      await this.finish();
    }
  }

  /**
   * Pause audio transmission and starts automatic keepalive messages
   */
  pause(): void {
    if (this._paused) return;

    this._paused = true;
    this.finalize();

    if (!this._pauseWarned && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      this._pauseWarned = true;
      // eslint-disable-next-line no-console
      console.warn('[Soniox] You are billed for the full stream duration even when session is paused.');
    }

    this.updateKeepalive();
  }

  /**
   * Resume audio transmission
   */
  resume(): void {
    if (!this._paused) return;

    this._paused = false;
    this.updateKeepalive();
  }

  /**
   * Requests the server to finalize current transcription
   */
  finalize(options?: { trailing_silence_ms?: number }): void {
    if (this._state !== 'connected' && this._state !== 'finishing') {
      return;
    }

    const message: Record<string, unknown> = { type: 'finalize' };
    if (options?.trailing_silence_ms !== undefined) {
      message.trailing_silence_ms = options.trailing_silence_ms;
    }
    this.sendMessage(JSON.stringify(message), false);
  }

  /**
   * Send what your agent is saying, so those words are recognized when the user
   * says them back and the agent's own voice is not transcribed as the user.
   *
   * The server places each piece where it sits among the audio frames, so send
   * it a little before the caller hears it - 500ms to 1s ahead of playback -
   * paced by how much of the reply has really been played, not by how fast the
   * model or the Text-to-Speech produced it.
   *
   * A segment is one agent turn. Close every turn with `end_of_segment: true`,
   * either on the last piece of text or on its own. Do the same on a barge-in:
   * send whatever was already played, close the segment, and drop the rest of
   * the reply, which the caller never heard.
   *
   * Requires `enable_agent_text_input` on the session config.
   *
   * @param text - The next piece of what the agent is saying, spaces included;
   *   Soniox joins the pieces exactly as sent. May be empty.
   * @param options - `end_of_segment` defaults to false, as on the wire
   * @throws {@link BadRequestError} If the config did not enable agent text input
   * @throws {@link StateError} If not connected
   */
  sendAgentText(text: string, options?: { end_of_segment?: boolean }): void {
    this.checkAborted();

    if (!this.config.enable_agent_text_input) {
      throw new BadRequestError('Set enable_agent_text_input on the session config to send agent text');
    }

    if (this._state !== 'connected') {
      throw new StateError(`Cannot send agent text: session is in "${this._state}" state`);
    }

    const message = {
      type: 'agent_text',
      text,
      end_of_segment: options?.end_of_segment ?? false,
    };
    this.sendMessage(JSON.stringify(message), true);
  }

  /**
   * Send a keepalive message
   */
  keepAlive(): void {
    if (this._state !== 'connected' && this._state !== 'finishing') {
      return;
    }

    this.sendMessage(JSON.stringify({ type: 'keepalive' }), false);
  }

  /**
   * Gracefully finish the session
   */
  async finish(): Promise<void> {
    this.checkAborted();

    if (this._state !== 'connected') {
      throw new StateError(`Cannot finish: session is in "${this._state}" state`);
    }

    if (this.streamEnded) {
      // The empty frame would go nowhere
      throw new StateError('Cannot finish: the realtime stream has ended');
    }

    // Stop pause mode
    if (this._paused) {
      this.resume();
    }

    this.setState('finishing', 'user_action');
    this.updateKeepalive();

    // Wait for finished response
    const finishPromise = new Promise<void>((resolve, reject) => {
      this.finishResolver = resolve;
      this.finishRejecter = reject;
    });

    // Send empty string to signal end of audio
    this.sendMessage('', false);

    return finishPromise;
  }

  /**
   * Close (cancel) the session immediately without waiting
   */
  close(): void {
    if (this.isTerminalState(this._state)) {
      return;
    }

    this.emitter.emit('disconnected', 'client_closed');
    this.settleFinish(new StateError('Session canceled'));
    this.cleanup('canceled', undefined, 'user_action');
  }

  /**
   * Register an event handler
   */
  on<E extends keyof SttSessionEvents>(event: E, handler: SttSessionEvents[E]): this {
    this.emitter.on(event, handler);
    return this;
  }

  /**
   * Register a one-time event handler
   */
  once<E extends keyof SttSessionEvents>(event: E, handler: SttSessionEvents[E]): this {
    this.emitter.once(event, handler);
    return this;
  }

  /**
   * Remove an event handler
   */
  off<E extends keyof SttSessionEvents>(event: E, handler: SttSessionEvents[E]): this {
    this.emitter.off(event, handler);
    return this;
  }

  /**
   * Async iterator for consuming events.
   *
   * The returned iterator's `return()` resets the internal iterator-attach
   * flag and drops any buffered events, so consumers that exit `for await`
   * early (via `break` etc.) stop accruing memory while the session keeps
   * running.
   */
  [Symbol.asyncIterator](): AsyncIterator<RealtimeEvent> {
    this.iteratorAttached = true;
    const inner = this.eventQueue[Symbol.asyncIterator]();
    return {
      next: () => inner.next(),
      return: (value?: RealtimeEvent) => {
        this.iteratorAttached = false;
        this.eventQueue.clear();
        return inner.return?.(value) ?? Promise.resolve({ value: value as RealtimeEvent, done: true });
      },
    };
  }

  /**
   * @internal Debug-only: forcefully close the underlying WebSocket to
   * simulate an unexpected network disconnection. The close carries no
   * terminal frame, so a stream with reconnect on is taken over rather than
   * ended.
   */
  __debugForceDisconnect(): void {
    this.ws?.close(4999, 'debug: simulated disconnect');
  }

  /**
   * Push an event to the async iterator queue only when a consumer has
   * attached via `[Symbol.asyncIterator]()`. Listener-only consumers
   * (the documented `.on()` pattern) never drain the queue, so pushing
   * unconditionally would leak buffered events on long-running sessions.
   */
  private enqueueIfIterating(event: RealtimeEvent): void {
    if (this.iteratorAttached) {
      this.eventQueue.push(event);
    }
  }

  private async createWebSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        // The lib typings only know the `protocols` form; `'headers'` relies on the
        // runtime accepting an options bag here, which the wrapping package vouches for.
        const ws = new WebSocket(this.wsBaseUrl, handshakeAuthArg(this.apiKey, this.authTransport) as string[]);
        this.ws = ws;
        ws.binaryType = 'arraybuffer';

        const cleanup = () => {
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('error', onError);
        };

        const onOpen = () => {
          cleanup();

          // Send config message
          const configMessage = buildConfigMessage(this.config);
          ws.send(JSON.stringify(configMessage));

          this.attachSocketHandlers(ws);

          resolve();
        };

        const onError = (event: Event) => {
          cleanup();
          reject(new ConnectionError('WebSocket connection failed', event));
        };

        ws.addEventListener('open', onOpen);
        ws.addEventListener('error', onError);

        // Handle abort during connection
        if (this.signal) {
          this.signal.addEventListener(
            'abort',
            () => {
              cleanup();
              ws.close();
              reject(new AbortError());
            },
            { once: true }
          );
        }
      } catch (error) {
        reject(new ConnectionError('Failed to create WebSocket', error));
      }
    });
  }

  /**
   * Set up message handlers, for as long as this is the session's connection
   * A connection the session has let go can still deliver, and what it
   * delivers looks like the end of a stream that is running elsewhere
   */
  private attachSocketHandlers(ws: WebSocket): void {
    ws.addEventListener('message', (event) => {
      if (this.ws === ws) this.handleMessage(event);
    });
    ws.addEventListener('close', (event) => {
      if (this.ws === ws) this.handleClose(event);
    });
    ws.addEventListener('error', (event) => {
      if (this.ws === ws) this.handleError(event);
    });
  }

  private handleMessage(event: MessageEvent): void {
    // Only handle string messages
    if (typeof event.data !== 'string') {
      return;
    }

    const data = event.data;

    try {
      const raw = JSON.parse(data) as RealtimeStreamFrame & Record<string, unknown>;

      if (this.reconnect !== null) {
        // The stream is live: pings count, and this is progress
        this.reconnect.streamStarted = true;
        this.reconnect.resumesWithoutAFrame = 0;
        if (!this.keepFrame(this.reconnect, raw)) {
          return;
        }
      }

      const result = parseResultMessage(raw);

      // Check for special tokens
      const hasEndpoint = result.tokens.some((t) => t.text === '<end>');
      const hasFinalized = result.tokens.some((t) => t.text === '<fin>');

      // Filter special tokens for user-facing events
      const userTokens = filterSpecialTokens(result.tokens);

      // Emit individual tokens
      for (const token of userTokens) {
        this.emitter.emit('token', token);
      }

      // Emit result with filtered tokens
      const filteredResult: RealtimeResult = {
        ...result,
        tokens: userTokens,
      };
      this.emitter.emit('result', filteredResult);
      this.enqueueIfIterating({ kind: 'result', data: filteredResult });

      if (hasEndpoint) {
        this.emitter.emit('endpoint');
        this.enqueueIfIterating({ kind: 'endpoint' });
      }

      if (hasFinalized) {
        this.emitter.emit('finalized');
        this.enqueueIfIterating({ kind: 'finalized' });
      }

      // Check for finished
      if (result.finished) {
        this.emitter.emit('finished');
        this.enqueueIfIterating({ kind: 'finished' });
        this.settleFinish();
        this.cleanup('finished', undefined, 'finished');
      }
    } catch (error) {
      const err = error as Error;
      this.emitter.emit('error', err);
      this.settleFinish(err);
      this.cleanup('error', err, 'error');
    }
  }

  private handleClose(event: CloseEvent): void {
    if (this.isTerminalState(this._state)) {
      return;
    }

    if (this.canResume()) {
      // Only a terminal frame ends the stream
      void this.takeOver();
      return;
    }

    this.emitter.emit('disconnected', event.reason || undefined);

    if (this._state === 'finishing') {
      const error = new ConnectionError('WebSocket closed before finished response', event);
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error, 'connection_lost');
      return;
    }

    // Unexpected close while connected — surface as error so consumers can react
    const error = new ConnectionError('WebSocket closed unexpectedly', event);
    this.emitter.emit('error', error);
    this.cleanup('closed', error, 'connection_lost');
  }

  private handleError(event: Event): void {
    if (this.canResume()) {
      void this.takeOver();
      return;
    }

    const error = new ConnectionError('WebSocket error', event);
    this.emitter.emit('error', error);
    this.settleFinish(error);
    this.cleanup('error', error, 'error');
  }

  private handleAbort(): void {
    const error = new AbortError();
    this.emitter.emit('error', error);
    this.settleFinish(error);
    this.cleanup('canceled', error, 'user_action');
  }

  private setState(newState: SttSessionState, reason?: StateChangeReason): void {
    if (this._state === newState) {
      return;
    }
    const oldState = this._state;
    this._state = newState;
    const update: { old_state: SttSessionState; new_state: SttSessionState; reason?: StateChangeReason } = {
      old_state: oldState,
      new_state: newState,
    };
    if (reason !== undefined) {
      update.reason = reason;
    }
    this.emitter.emit('state_change', update);
  }

  private cleanup(
    finalState: 'closed' | 'error' | 'finished' | 'canceled',
    error?: Error,
    reason?: StateChangeReason
  ): void {
    // Asked before the state moves, which makes it terminal
    const stranded = this.reconnect !== null && this.ws === null && this.canResume() ? this.reconnect.url : null;

    this.setState(finalState, reason);
    this.stopKeepalive();
    this.stopReconnect();

    if (this.signal && this.abortHandler) {
      this.signal.removeEventListener('abort', this.abortHandler);
      this.abortHandler = null;
    }

    if (this.ws) {
      // Without the 1000 the stream bills out its idle timeout
      this.ws.close(NORMAL_CLOSE_CODE);
      this.ws = null;
    } else if (stranded !== null && this.reconnect?.token != null) {
      this.endStrandedStream(this.reconnect, stranded, this.reconnect.token);
    }

    // End the event queue
    if (error) {
      this.eventQueue.abort(error);
    } else {
      this.eventQueue.end();
    }

    this.emitter.removeAllListeners();
  }

  private isTerminalState(state: SttSessionState): boolean {
    return state === 'closed' || state === 'error' || state === 'finished' || state === 'canceled';
  }

  private checkAborted(): void {
    if (this.signal?.aborted) {
      throw new AbortError();
    }
  }

  private settleFinish(error?: Error): void {
    if (!this.finishResolver && !this.finishRejecter) {
      return;
    }

    const resolve = this.finishResolver;
    const reject = this.finishRejecter;
    this.finishResolver = null;
    this.finishRejecter = null;

    if (error) {
      reject?.(error);
    } else {
      resolve?.();
    }
  }

  private sendMessage(data: string | Uint8Array, shouldThrow: boolean): void {
    if (this.streamEnded) {
      // A resend that can never come would lose this silently
      if (shouldThrow) {
        throw new StateError('Cannot send: the realtime stream has ended');
      }
      return;
    }

    if (this.reconnect !== null) {
      this.reconnect.record(data);
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.canResume()) {
        return;
      }

      const error = new ConnectionError('WebSocket is not open');
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error, 'error');
      if (shouldThrow) {
        throw error;
      }
      return;
    }

    try {
      this.ws.send(data);
    } catch (err) {
      if (this.canResume()) {
        // The close takes the stream over; this goes out again
        return;
      }

      const error = new ConnectionError('WebSocket send failed', err);
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error, 'error');
      if (shouldThrow) {
        throw error;
      }
    }
  }

  private startKeepalive(): void {
    if (this.keepaliveInterval) return;

    this.keepaliveInterval = setInterval(() => {
      this.keepAlive();
    }, this.keepaliveIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  private updateKeepalive(): void {
    const isActiveState = this._state === 'connected' || this._state === 'finishing';

    if (isActiveState && this._paused) {
      this.startKeepalive();
    } else {
      this.stopKeepalive();
    }
  }

  /**
   * Whether a new connection may continue this stream
   * The server decides per stream, and sends a `reconnect` frame when it can;
   * a terminal frame ends the stream for good
   */
  private canResume(): boolean {
    return this.reconnect?.url != null && !this.streamEnded && !this.isTerminalState(this._state);
  }

  /**
   * Ping, so a lost connection is noticed and the resend log stays short
   * One timer does both: a ping goes out every interval, and a ping still
   * unanswered an interval later means the connection is gone
   */
  private pingTick(): void {
    const state = this.reconnect;
    if (this.ws === null || state === null) {
      return;
    }

    if (state.pongOverdue(this.pingIntervalMs)) {
      if (this.canResume()) {
        void this.takeOver();
        return;
      }

      const error = new ConnectionError('The connection was lost: a ping went unanswered');
      this.emitter.emit('disconnected', 'connection_lost');
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error, 'connection_lost');
      return;
    }

    try {
      this.ws.send(state.ping());
    } catch {
      // The missing pong is the signal
    }
  }

  /**
   * Track what the stream needs to continue on a new connection
   *
   * @returns False for the frames the reconnect protocol answers itself, and
   *   for responses a reconnect replayed, which a consumer has already seen.
   */
  private keepFrame(state: Reconnect, raw: RealtimeStreamFrame): boolean {
    if (raw.type === 'reconnect') {
      state.token = raw.reconnect_token ?? null;
      state.url = raw.reconnect_url ?? null;
      // Pings before the stream starts are answered late
      state.clearPings();
      return false;
    }

    if (raw.type === 'pong') {
      state.pong(raw.id);
      return false;
    }

    if (raw.error_type === 'connection_replaced') {
      // A newer connection has it: let this one go
      this.streamEnded = true;
      this.dropSocket();
      return true;
    }

    if ((raw.error_code !== undefined && raw.error_code !== 0) || raw.error_message !== undefined || raw.finished) {
      // Before the `seq` check: a terminal frame may carry no `seq` at all
      this.streamEnded = true;
      return true;
    }

    if (raw.seq !== undefined) {
      if (raw.seq <= state.lastSeq) {
        return false;
      }
      state.lastSeq = raw.seq;
    }

    return true;
  }

  /**
   * Continue the stream on a new connection
   * Nothing ends the session while this is in flight: no end of stream is
   * emitted, `finish()` stays pending, and sends go into the resend log
   */
  private async takeOver(): Promise<void> {
    const state = this.reconnect;
    const url = state?.url ?? null;
    if (state === null || url === null || this.takingOver) {
      // One at a time: only the newer attempt wins
      return;
    }

    this.takingOver = true;
    this.dropSocket();
    // Before the first dial: the wait can last the window
    this.emitter.emit('resuming');
    this.enqueueIfIterating({ kind: 'resuming' });

    // From the last pong: a silent drop predates us noticing
    const deadline = state.ackedAt + this.reconnectWindowMs;
    let delayMs = RECONNECT_BACKOFF_MS;

    try {
      while (Date.now() < deadline) {
        if (this.isTerminalState(this._state)) {
          return;
        }

        if (state.resumesWithoutAFrame >= MAX_RESUMES_WITHOUT_A_FRAME) {
          this.failTakeover(
            new ConnectionError(
              `The stream could not be continued: it was continued ${MAX_RESUMES_WITHOUT_A_FRAME} times with no response from the server`
            )
          );
          return;
        }

        // Half of what is left, so a hang leaves a second try
        const attemptEnds = Date.now() + Math.max((deadline - Date.now()) / 2, MIN_RECONNECT_ATTEMPT_MS);

        const outcome = await this.dial(state, url, attemptEnds);
        if (outcome.resumed) {
          return;
        }
        if (outcome.fatal) {
          this.failTakeover(outcome.error);
          return;
        }
        if (this.isTerminalState(this._state)) {
          return;
        }

        // Equal jitter, so clients do not dial together
        await this.wait(delayMs / 2 + Math.random() * (delayMs / 2));
        delayMs = Math.min(delayMs * 2, MAX_RECONNECT_BACKOFF_MS);
      }
    } finally {
      this.takingOver = false;
    }

    this.failTakeover(new ConnectionError('The stream was not continued before its reconnect window closed'));
  }

  /**
   * Open a connection and ask it to continue the stream
   * The reconnect request must be the very first message on the new socket:
   * the reconnect URL accepts nothing else as its first frame
   *
   * @param attemptEnds - When this attempt's share of the window runs out.
   * @returns What the attempt did. The promise does not reject.
   */
  private dial(state: Reconnect, url: string, attemptEnds: number): Promise<DialOutcome> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url, handshakeAuthArg(this.apiKey, this.authTransport) as string[]);
      } catch (error) {
        resolve({ resumed: false, fatal: false, error: new ConnectionError('Failed to create WebSocket', error) });
        return;
      }
      this.dialWs = ws;
      this.dialPresented = false;
      ws.binaryType = 'arraybuffer';

      let timer: ReturnType<typeof setTimeout>;

      const left = (ceiling: number) => Math.max(Math.min(ceiling, attemptEnds - Date.now()), MIN_RECONNECT_WAIT_MS);

      const done = (outcome: DialOutcome) => {
        clearTimeout(timer);
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('message', onReply);
        ws.removeEventListener('error', onFailure);
        ws.removeEventListener('close', onFailure);
        this.dialWs = null;
        this.dialPresented = false;
        if (!outcome.resumed) {
          this.abandon(ws);
        }
        resolve(outcome);
      };

      const failed = (error: ConnectionError, fatal: boolean) => done({ resumed: false, fatal, error });

      const onOpen = () => {
        ws.send(JSON.stringify({ type: 'reconnect', reconnect_token: state.token, last_seq: state.lastSeq }));
        this.dialPresented = true;
        clearTimeout(timer);
        timer = setTimeout(
          () => failed(new ConnectionError('The reconnect was not answered in time'), false),
          left(RECONNECT_REPLY_TIMEOUT_MS)
        );
      };

      const onReply = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          return;
        }

        let reply: RealtimeStreamFrame;
        try {
          reply = JSON.parse(event.data) as RealtimeStreamFrame;
        } catch (error) {
          failed(new ConnectionError('The reconnect reply could not be read', error), false);
          return;
        }

        if (reply.type !== 'reconnected' || reply.reconnect_token === undefined || reply.last_request === undefined) {
          // No count means resending audio the server already has
          failed(new ConnectionError(reply.error_message ?? 'The stream could not be continued', reply), true);
          return;
        }

        if (this.isTerminalState(this._state)) {
          // `cleanup()` ends the stream; keeping this reads nothing
          failed(new ConnectionError('The session was closed while the stream was being continued'), true);
          return;
        }

        // Adopt before any await: one read delivers every frame
        done({ resumed: true });
        this.continueStream(state, ws, reply);
      };

      const onFailure = (event: Event) => {
        // A refused handshake is final; a 5xx may clear
        const status = handshakeStatus(event);
        const refused = status !== null && status < 500;
        failed(
          new ConnectionError(
            refused
              ? `The stream could not be continued: the server answered ${status}`
              : 'The reconnect connection failed',
            event
          ),
          refused
        );
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('message', onReply);
      ws.addEventListener('error', onFailure);
      ws.addEventListener('close', onFailure);
      timer = setTimeout(
        () => failed(new ConnectionError('The reconnect connection did not open in time'), false),
        left(this.connectTimeoutMs)
      );
    });
  }

  /**
   * Take the new connection's word for what the server has, and send the rest
   * The server does not dedup resent audio, so it has to be exactly the
   * messages after `last_request`, in order
   */
  private continueStream(state: Reconnect, ws: WebSocket, reply: RealtimeStreamFrame): void {
    const received = reply.last_request ?? 0;
    const resend = state.resendAfter(received, reply.reconnect_token ?? '');

    this.ws = ws;
    this.attachSocketHandlers(ws);

    for (const message of resend) {
      try {
        ws.send(message.data);
      } catch {
        // Stop at the first failure: the server counts what it reads
        break;
      }
    }

    this.emitter.emit('resumed');
    this.enqueueIfIterating({ kind: 'resumed' });
  }

  /** The stream is gone for good, with the reason the last attempt gave */
  private failTakeover(error: ConnectionError): void {
    if (this.isTerminalState(this._state)) {
      return;
    }

    this.streamEnded = true;
    this.emitter.emit('disconnected', 'connection_lost');
    this.emitter.emit('error', error);
    this.settleFinish(error);
    this.cleanup('error', error, 'connection_lost');
  }

  /**
   * End a stream that has no connection left to end it on
   *
   * Closing in the middle of a takeover leaves nothing to say the stream is
   * over on, and a stream nobody ends waits out its idle timeout - billed on
   * wall clock, and holding a concurrent request slot the whole time. So it is
   * taken over once more, briefly, only to be closed properly.
   *
   * Best effort: nothing waits for it, and a failure is not worth reporting to
   * a caller who has already closed. The close goes out after the server has
   * answered, because until then this socket holds no stream to end.
   */
  private endStrandedStream(state: Reconnect, url: string, token: string): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, handshakeAuthArg(this.apiKey, this.authTransport) as string[]);
    } catch {
      return;
    }

    // 1000 whatever happened: a 4000 would ask it to keep the stream
    const end = () => {
      clearTimeout(giveUp);
      try {
        ws.close(NORMAL_CLOSE_CODE);
      } catch {
        // Already gone; the server ends a stream whose socket dies
      }
    };

    const giveUp = setTimeout(end, CLOSE_DIAL_TIMEOUT_MS);
    ws.addEventListener('open', () => {
      try {
        ws.send(JSON.stringify({ type: 'reconnect', reconnect_token: token, last_seq: state.lastSeq }));
      } catch {
        end();
      }
    });
    ws.addEventListener('message', end, { once: true });
    ws.addEventListener('close', () => clearTimeout(giveUp));
    ws.addEventListener('error', () => clearTimeout(giveUp));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.endBackoff = null;
        resolve();
      }, ms);
      this.endBackoff = () => {
        clearTimeout(timer);
        this.endBackoff = null;
        resolve();
      };
    });
  }

  /** Let the session's connection go without ending the stream */
  private dropSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) {
      this.abandon(ws);
    }
  }

  /** Close a connection without telling the server the stream is over */
  private abandon(ws: WebSocket): void {
    try {
      ws.close(ABANDONED_CLOSE_CODE, 'reconnecting');
    } catch {
      // Already gone
    }
  }

  private stopReconnect(): void {
    // A presented token may already hold the stream, so 1000
    const presented = this.dialPresented;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.endBackoff?.();
    if (this.dialWs) {
      if (presented) {
        try {
          this.dialWs.close(NORMAL_CLOSE_CODE);
        } catch {
          // Already gone
        }
      } else {
        this.abandon(this.dialWs);
      }
      this.dialWs = null;
      this.dialPresented = false;
    }
  }
}
