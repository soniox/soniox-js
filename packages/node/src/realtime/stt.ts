import type {
  AudioData,
  RealtimeEvent,
  RealtimeResult,
  RealtimeToken,
  SendStreamOptions,
  SttSessionConfig,
  SttSessionEvents,
  SttSessionOptions,
  SttSessionState,
} from '../types/public/realtime.js';

import { AsyncEventQueue } from './async-queue.js';
import { TypedEmitter } from './emitter.js';
import { AbortError, ConnectionError, StateError, mapErrorResponse } from './errors.js';

// Default keepalive interval
const DEFAULT_KEEPALIVE_INTERVAL_MS = 5000;

/**
 * Convert audio data to Uint8Array
 * Handles Buffer, Uint8Array, and ArrayBuffer
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
function buildConfigMessage(config: SttSessionConfig, apiKey: string): Record<string, unknown> {
  return {
    api_key: apiKey,
    model: config.model,
    audio_format: config.audio_format ?? 'auto',
    sample_rate: config.sample_rate,
    num_channels: config.num_channels,
    language_hints: config.language_hints,
    language_hints_strict: config.language_hints_strict,
    enable_speaker_diarization: config.enable_speaker_diarization,
    enable_language_identification: config.enable_language_identification,
    enable_endpoint_detection: config.enable_endpoint_detection,
    client_reference_id: config.client_reference_id,
    context: config.context,
    translation: config.translation,
  };
}

/**
 * Parse a result message from the WebSocket
 */
function parseResultMessage(data: string): RealtimeResult & { raw: unknown } {
  const raw = JSON.parse(data) as Record<string, unknown>;

  // Check for error response
  if ('error_code' in raw || 'error_message' in raw) {
    throw mapErrorResponse(raw as { error_code?: number; error_message?: string });
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
 * Real-time Speech-to-Text session
 *
 * Provides WebSocket-based streaming transcription with support for:
 * - Event-based and async iterator consumption
 * - Pause/resume with automatic keepalive
 * - AbortSignal cancellation
 *
 * @example
 * ```typescript
 * const session = client.realtime.stt({ model: 'stt-rt-preview' });
 *
 * session.on('result', (result) => {
 *   console.log(result.tokens.map(t => t.text).join(''));
 * });
 *
 * await session.connect();
 * await session.sendAudio(audioChunk);
 * await session.finish();
 * ```
 */
export class RealtimeSttSession implements AsyncIterable<RealtimeEvent> {
  private readonly emitter = new TypedEmitter<SttSessionEvents>();
  private readonly eventQueue = new AsyncEventQueue<RealtimeEvent>();

  private readonly apiKey: string;
  private readonly wsBaseUrl: string;
  private readonly config: SttSessionConfig;
  private readonly keepaliveIntervalMs: number;
  private readonly keepaliveEnabled: boolean;
  private readonly signal: AbortSignal | undefined;

  private ws: WebSocket | null = null;
  private _state: SttSessionState = 'idle';
  private _paused = false;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  // Finish promise handling
  private finishResolver: (() => void) | null = null;
  private finishRejecter: ((error: Error) => void) | null = null;

  // Abort handler reference for cleanup
  private abortHandler: (() => void) | null = null;

  constructor(apiKey: string, wsBaseUrl: string, config: SttSessionConfig, options?: SttSessionOptions) {
    this.apiKey = apiKey;
    this.wsBaseUrl = wsBaseUrl;
    this.config = config;
    this.keepaliveIntervalMs = options?.keepalive_interval_ms ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
    this.keepaliveEnabled = options?.keepalive ?? false;
    this.signal = options?.signal;

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
   * @throws {AbortError} If aborted
   * @throws {NetworkError} If connection fails
   * @throws {StateError} If already connected
   */
  async connect(): Promise<void> {
    if (this._state !== 'idle') {
      throw new StateError(`Cannot connect: session is in "${this._state}" state`);
    }

    this.checkAborted();
    this.setState('connecting');

    try {
      await this.createWebSocket();
      this.setState('connected');
      this.emitter.emit('connected');
      this.updateKeepalive();
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  /**
   * Send audio data to the server
   *
   * @param data - Audio data as Buffer, Uint8Array, or ArrayBuffer
   * @throws {AbortError} If aborted
   * @throws {StateError} If not connected
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
   * Reads chunks from the iterable and sends each via {@link sendAudio}.
   * Works with Node.js ReadableStreams, Web ReadableStreams, async generators,
   * and any other `AsyncIterable<AudioData>`.
   *
   * @param stream - Async iterable yielding audio chunks
   * @param options - Optional pacing and auto-finish settings
   * @throws {AbortError} If aborted during streaming
   * @throws {StateError} If not connected
   *
   * @example
   * ```typescript
   * // Stream from a Node.js file
   * import fs from 'fs';
   * await session.sendStream(fs.createReadStream('audio.mp3'), { finish: true });
   *
   * // Stream with simulated real-time pacing
   * await session.sendStream(
   *   fs.createReadStream('audio.pcm_s16le', { highWaterMark: 3840 }),
   *   { pace_ms: 120, finish: true }
   * );
   *
   * // Stream from a Web fetch response
   * const response = await fetch('https://soniox.com/media/examples/coffee_shop.mp3');
   * await session.sendStream(response.body, { finish: true });
   * ```
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

    // Stop pause mode
    if (this._paused) {
      this.resume();
    }

    this.setState('finishing');
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
    this.emitter.emit('disconnected', 'client_closed');
    this.settleFinish(new StateError('Session canceled'));
    this.cleanup('canceled');
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
   */
  [Symbol.asyncIterator](): AsyncIterator<RealtimeEvent> {
    return this.eventQueue[Symbol.asyncIterator]();
  }

  private async createWebSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(this.wsBaseUrl);
        this.ws = ws;
        ws.binaryType = 'arraybuffer';

        const cleanup = () => {
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('error', onError);
        };

        const onOpen = () => {
          cleanup();

          // Send config message
          const configMessage = buildConfigMessage(this.config, this.apiKey);
          ws.send(JSON.stringify(configMessage));

          // Set up message handlers
          ws.addEventListener('message', this.handleMessage.bind(this));
          ws.addEventListener('close', this.handleClose.bind(this));
          ws.addEventListener('error', this.handleError.bind(this));

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

  private handleMessage(event: MessageEvent): void {
    // Only handle string messages
    if (typeof event.data !== 'string') {
      return;
    }

    const data = event.data;

    try {
      const result = parseResultMessage(data);

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
      this.eventQueue.push({ kind: 'result', data: filteredResult });

      if (hasEndpoint) {
        this.emitter.emit('endpoint');
        this.eventQueue.push({ kind: 'endpoint' });
      }

      if (hasFinalized) {
        this.emitter.emit('finalized');
        this.eventQueue.push({ kind: 'finalized' });
      }

      // Check for finished
      if (result.finished) {
        this.emitter.emit('finished');
        this.eventQueue.push({ kind: 'finished' });
        this.settleFinish();
        this.cleanup('finished');
      }
    } catch (error) {
      const err = error as Error;
      this.emitter.emit('error', err);
      this.settleFinish(err);
      this.cleanup('error', err);
    }
  }

  private handleClose(event: CloseEvent): void {
    if (this.isTerminalState(this._state)) {
      return;
    }

    this.emitter.emit('disconnected', event.reason || undefined);

    if (this._state === 'finishing') {
      const error = new ConnectionError('WebSocket closed before finished response', event);
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error);
      return;
    }

    this.cleanup('closed');
  }

  private handleError(event: Event): void {
    const error = new ConnectionError('WebSocket error', event);
    this.emitter.emit('error', error);
    this.settleFinish(error);
    this.cleanup('error', error);
  }

  private handleAbort(): void {
    const error = new AbortError();
    this.emitter.emit('error', error);
    this.settleFinish(error);
    this.cleanup('canceled', error);
  }

  private setState(newState: SttSessionState): void {
    if (this._state === newState) {
      return;
    }
    const oldState = this._state;
    this._state = newState;
    this.emitter.emit('state_change', { old_state: oldState, new_state: newState });
  }

  private cleanup(finalState: 'closed' | 'error' | 'finished' | 'canceled', error?: Error): void {
    this.setState(finalState);
    this.stopKeepalive();

    if (this.signal && this.abortHandler) {
      this.signal.removeEventListener('abort', this.abortHandler);
      this.abortHandler = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const error = new ConnectionError('WebSocket is not open');
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error);
      if (shouldThrow) {
        throw error;
      }
      return;
    }

    try {
      this.ws.send(data);
    } catch (err) {
      const error = new ConnectionError('WebSocket send failed', err);
      this.emitter.emit('error', error);
      this.settleFinish(error);
      this.cleanup('error', error);
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
    const shouldRun = isActiveState && (this._paused || this.keepaliveEnabled);

    if (shouldRun) {
      this.startKeepalive();
    } else {
      this.stopKeepalive();
    }
  }
}
