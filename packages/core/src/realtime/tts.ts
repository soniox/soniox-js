import type {
  TtsConnectionEvents,
  TtsConnectionOptions,
  TtsEvent,
  TtsStreamConfig,
  TtsStreamEvents,
  TtsStreamInput,
  TtsStreamState,
} from '../types/tts.js';

import { AsyncEventQueue } from './async-queue.js';
import { TypedEmitter } from './emitter.js';
import { ConnectionError, StateError, mapErrorResponse } from './errors.js';

const MAX_STREAMS_PER_CONNECTION = 5;
const DEFAULT_KEEPALIVE_INTERVAL_MS = 5000;
const MIN_KEEPALIVE_INTERVAL_MS = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 20000;

function generateStreamId(): string {
  return globalThis.crypto.randomUUID();
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Merge a partial TTS stream input with defaults, validate required fields,
 * and return a fully resolved config ready for the WebSocket.
 */
function resolveStreamConfig(input: TtsStreamInput, defaults: Partial<TtsStreamConfig>): TtsStreamConfig {
  const merged = { ...defaults, ...input };
  const model = merged.model;
  const language = merged.language;
  const voice = merged.voice;
  const audio_format = merged.audio_format;

  const missing: string[] = [];
  if (!model) missing.push('model');
  if (!language) missing.push('language');
  if (!voice) missing.push('voice');
  if (!audio_format) missing.push('audio_format');

  if (missing.length > 0) {
    throw new Error(
      `Missing required TTS stream fields: ${missing.join(', ')}. ` +
        'Provide them directly or via tts_defaults in your connection config.'
    );
  }

  return {
    model: model!,
    language: language!,
    voice: voice!,
    audio_format: audio_format!,
    ...(merged.sample_rate !== undefined && { sample_rate: merged.sample_rate }),
    ...(merged.bitrate !== undefined && { bitrate: merged.bitrate }),
    stream_id: merged.stream_id ?? generateStreamId(),
  };
}

// =============================================================================
// RealtimeTtsStream
// =============================================================================

/**
 * Handle for one TTS stream on a WebSocket connection.
 *
 * Emits typed events and supports async iteration over decoded audio chunks.
 *
 * @example Event-based
 * ```typescript
 * stream.on('audio', (chunk) => process(chunk));
 * stream.on('terminated', () => console.log('done'));
 * stream.sendText("Hello world");
 * stream.finish();
 * ```
 *
 * @example Async iteration
 * ```typescript
 * stream.sendText("Hello world");
 * stream.finish();
 * for await (const chunk of stream) {
 *   process(chunk);
 * }
 * ```
 */
export class RealtimeTtsStream extends TypedEmitter<TtsStreamEvents> implements AsyncIterable<Uint8Array> {
  readonly streamId: string;

  private _state: TtsStreamState = 'active';
  private readonly audioQueue = new AsyncEventQueue<Uint8Array>();
  private readonly connection: RealtimeTtsConnection;
  private readonly ownsConnection: boolean;

  /** @internal */
  constructor(streamId: string, connection: RealtimeTtsConnection, ownsConnection: boolean) {
    super();
    this.streamId = streamId;
    this.connection = connection;
    this.ownsConnection = ownsConnection;
  }

  /** Current stream lifecycle state. */
  get state(): TtsStreamState {
    return this._state;
  }

  /**
   * Send one text chunk to the TTS stream.
   *
   * @param text - Text to synthesize
   * @param options.end - If true, signals this is the final text chunk
   */
  sendText(text: string, options?: { end?: boolean }): void {
    if (this._state !== 'active') {
      throw new StateError(`Cannot send text in state '${this._state}'`);
    }
    const payload = {
      text,
      text_end: options?.end ?? false,
      stream_id: this.streamId,
    };
    this.connection._sendJson(payload);
    if (options?.end) {
      this._state = 'finishing';
    }
  }

  /**
   * Pipe an async iterable of text chunks into the stream.
   * Automatically calls {@link finish} when the iterable completes.
   *
   * Designed for concurrent use: call `sendStream()` and consume audio
   * via `for await` or events simultaneously.
   *
   * @example LLM token piping
   * ```typescript
   * stream.sendStream(llmTokenStream);
   * for await (const audio of stream) { forward(audio); }
   * ```
   */
  async sendStream(source: AsyncIterable<string>): Promise<void> {
    for await (const chunk of source) {
      if (this._state !== 'active') break;
      this.sendText(chunk);
    }
    if (this._state === 'active') {
      this.finish();
    }
  }

  /**
   * Signal that no more text will be sent for this stream.
   * The server will finish generating audio and send `terminated`.
   */
  finish(): void {
    if (this._state !== 'active') {
      throw new StateError(`Cannot finish in state '${this._state}'`);
    }
    this.sendText('', { end: true });
  }

  /**
   * Cancel this stream. The server will stop generating and send `terminated`.
   */
  cancel(): void {
    if (this._state === 'ended' || this._state === 'error') return;
    const payload = {
      stream_id: this.streamId,
      cancel: true,
    };
    try {
      this.connection._sendJson(payload);
    } catch {
      // Connection may already be closed
    }
  }

  /**
   * Close this stream. For single-stream usage (created via `tts(input)`),
   * also closes the underlying WebSocket connection.
   */
  close(): void {
    this._endStream();
    if (this.ownsConnection) {
      this.connection.close();
    }
  }

  /** Async iterator that yields decoded audio chunks. */
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return this.audioQueue[Symbol.asyncIterator]();
  }

  /** @internal Dispatch a server event to this stream. */
  _handleEvent(event: TtsEvent): void {
    if (event.error_code !== undefined) {
      const errPayload: { error_code: number; error_message?: string } = {
        error_code: event.error_code,
      };
      if (event.error_message !== undefined) {
        errPayload.error_message = event.error_message;
      }
      const error = mapErrorResponse(errPayload);
      this._state = 'error';
      this.emit('error', error);
      this.audioQueue.abort(error);
      this.connection._deactivateStream(this.streamId);
      return;
    }

    if (event.audio !== undefined) {
      const chunk = decodeBase64ToUint8Array(event.audio);
      this.emit('audio', chunk);
      this.audioQueue.push(chunk);
    }

    if (event.audio_end) {
      this.emit('audioEnd');
    }

    if (event.terminated) {
      this._endStream();
    }
  }

  /** @internal Force-end this stream (connection closing). */
  _forceEnd(): void {
    if (this._state === 'ended' || this._state === 'error') return;
    this._state = 'ended';
    this.audioQueue.end();
  }

  private _endStream(): void {
    if (this._state === 'ended') return;
    this._state = 'ended';
    this.emit('terminated');
    this.audioQueue.end();
    this.connection._deactivateStream(this.streamId);
  }
}

// =============================================================================
// RealtimeTtsConnection
// =============================================================================

/**
 * WebSocket connection for real-time Text-to-Speech.
 *
 * Supports up to 5 concurrent streams multiplexed by `stream_id`.
 * The connection automatically sends keepalive messages while open.
 *
 * @example Multi-stream
 * ```typescript
 * const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
 * await conn.connect();
 *
 * const s1 = conn.stream({ model, voice, language, audio_format });
 * s1.sendText("Hello");
 * s1.finish();
 * for await (const chunk of s1) { ... }
 *
 * conn.close();
 * ```
 */
export class RealtimeTtsConnection extends TypedEmitter<TtsConnectionEvents> {
  private readonly apiKey: string;
  private readonly wsUrl: string;
  private readonly ttsDefaults: Partial<TtsStreamConfig>;
  private readonly keepaliveIntervalMs: number;
  private readonly connectTimeoutMs: number;

  private ws: WebSocket | null = null;
  private connected = false;
  private connecting = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly activeStreams = new Map<string, RealtimeTtsStream>();

  constructor(
    apiKey: string,
    wsUrl: string,
    ttsDefaults: Partial<TtsStreamConfig> = {},
    options?: TtsConnectionOptions
  ) {
    super();
    this.apiKey = apiKey;
    this.wsUrl = wsUrl;
    this.ttsDefaults = ttsDefaults;

    const keepaliveMs = options?.keepalive_interval_ms ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
    this.keepaliveIntervalMs =
      Number.isFinite(keepaliveMs) && keepaliveMs > 0
        ? Math.max(keepaliveMs, MIN_KEEPALIVE_INTERVAL_MS)
        : DEFAULT_KEEPALIVE_INTERVAL_MS;

    const connectMs = options?.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.connectTimeoutMs = Number.isFinite(connectMs) && connectMs > 0 ? connectMs : DEFAULT_CONNECT_TIMEOUT_MS;
  }

  /** Whether the WebSocket is connected. */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Open the WebSocket connection and start keepalive.
   * Called automatically by {@link stream} if not yet connected.
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      throw new StateError('Connection is already being established');
    }

    this.connecting = true;

    try {
      await this.createWebSocket();
      this.connected = true;
      this.startKeepalive();
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Open a new TTS stream on this connection.
   * Auto-connects if the WebSocket is not yet open.
   *
   * @param input - Stream configuration (merged with tts_defaults)
   * @returns A ready-to-use stream handle
   */
  async stream(input: TtsStreamInput = {}): Promise<RealtimeTtsStream> {
    return this._openStream(input, false);
  }

  /** @internal Open a stream, optionally marking it as connection-owning. */
  async _openStream(input: TtsStreamInput, ownsConnection: boolean): Promise<RealtimeTtsStream> {
    if (!this.connected) {
      await this.connect();
    }

    if (this.activeStreams.size >= MAX_STREAMS_PER_CONNECTION) {
      throw new StateError(`Maximum concurrent streams (${MAX_STREAMS_PER_CONNECTION}) reached`);
    }

    const config = resolveStreamConfig(input, this.ttsDefaults);

    if (this.activeStreams.has(config.stream_id)) {
      throw new StateError(`Stream '${config.stream_id}' is already active on this connection`);
    }

    const stream = new RealtimeTtsStream(config.stream_id, this, ownsConnection);
    this.activeStreams.set(config.stream_id, stream);

    const configPayload = {
      api_key: this.apiKey,
      ...config,
    };
    this._sendJson(configPayload);

    return stream;
  }

  /**
   * Close the WebSocket connection and terminate all active streams.
   */
  close(): void {
    this.stopKeepalive();

    for (const stream of this.activeStreams.values()) {
      stream._forceEnd();
    }
    this.activeStreams.clear();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.connected = false;
    this.emit('close');
  }

  /** @internal Send a JSON payload on the WebSocket. */
  _sendJson(payload: Record<string, unknown>): void {
    if (!this.ws || !this.connected) {
      throw new StateError('TTS connection is not open');
    }
    this.ws.send(JSON.stringify(payload));
  }

  /** @internal Remove a stream from the active set. */
  _deactivateStream(streamId: string): void {
    this.activeStreams.delete(streamId);
  }

  private async createWebSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // Ignore
        }
        reject(new ConnectionError('TTS WebSocket connection timed out'));
      }, this.connectTimeoutMs);

      let ws: WebSocket;
      try {
        ws = new WebSocket(this.wsUrl);
        ws.binaryType = 'arraybuffer';
      } catch (err) {
        clearTimeout(timer);
        reject(
          new ConnectionError(`Failed to create TTS WebSocket: ${err instanceof Error ? err.message : String(err)}`)
        );
        return;
      }

      const onOpen = () => {
        clearTimeout(timer);
        ws.removeEventListener('error', onError);
        this.ws = ws;

        ws.addEventListener('message', (event: MessageEvent) => {
          this.handleMessage(event);
        });
        ws.addEventListener('close', () => {
          if (this.connected) {
            this.connected = false;
            this.stopKeepalive();
            for (const stream of this.activeStreams.values()) {
              stream._forceEnd();
            }
            this.activeStreams.clear();
            this.emit('close');
          }
        });

        resolve();
      };

      const onError = () => {
        clearTimeout(timer);
        ws.removeEventListener('open', onOpen);
        reject(new ConnectionError('TTS WebSocket connection failed'));
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
    });
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return;

    let parsed: TtsEvent;
    try {
      parsed = JSON.parse(event.data) as TtsEvent;
    } catch {
      return;
    }

    const streamId = parsed.stream_id;

    if (streamId !== undefined) {
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream._handleEvent(parsed);
      }
      return;
    }

    if (parsed.error_code !== undefined) {
      const errPayload: { error_code: number; error_message?: string } = {
        error_code: parsed.error_code,
      };
      if (parsed.error_message !== undefined) {
        errPayload.error_message = parsed.error_message;
      }
      const error = mapErrorResponse(errPayload);
      this.emit('error', error);
    }
  }

  private startKeepalive(): void {
    if (this.keepaliveTimer) return;
    this.keepaliveTimer = setInterval(() => {
      if (this.connected && this.ws) {
        try {
          this.ws.send(JSON.stringify({ keep_alive: true }));
        } catch {
          // Ignore send errors during keepalive
        }
      }
    }, this.keepaliveIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}
