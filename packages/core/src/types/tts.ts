import type { RealtimeError } from '../realtime/errors.js';

// =============================================================================
// TTS Audio Format
// =============================================================================

/**
 * Supported audio formats for Text-to-Speech output.
 */
export type TtsAudioFormat =
  | 'pcm_f32le'
  | 'pcm_s16le'
  | 'pcm_mulaw'
  | 'pcm_alaw'
  | 'wav'
  | 'aac'
  | 'mp3'
  | 'opus'
  | 'flac'
  | (string & {});

// =============================================================================
// TTS Stream Configuration
// =============================================================================

/**
 * Input for creating a TTS stream. All fields are optional and are merged
 * with `tts_defaults` from the resolved connection config. After merging,
 * `model`, `language`, `voice`, and `audio_format` must be present.
 */
export type TtsStreamInput = {
  /**
   * Text-to-Speech model to use.
   * @example 'tts-rt-v1'
   */
  model?: string | undefined;

  /**
   * Language code for speech generation.
   * @example 'en'
   */
  language?: string | undefined;

  /**
   * Voice identifier.
   * @example 'Adrian'
   */
  voice?: string | undefined;

  /**
   * Output audio format
   * @example 'wav'
   */
  audio_format?: TtsAudioFormat | undefined;

  /**
   * Output sample rate in Hz. Required for raw PCM formats.
   */
  sample_rate?: number | undefined;

  /**
   * Codec bitrate in bps (for compressed formats).
   */
  bitrate?: number | undefined;

  /**
   * Client-generated stream identifier. Must be unique among active streams
   * on the same connection. Auto-generated if omitted.
   */
  stream_id?: string | undefined;
};

/**
 * Fully resolved TTS stream config sent over the WebSocket.
 * All required fields are present after merging input with defaults.
 */
export type TtsStreamConfig = {
  model: string;
  language: string;
  voice: string;
  audio_format: string;
  sample_rate?: number | undefined;
  bitrate?: number | undefined;
  stream_id: string;
};

// =============================================================================
// TTS Connection Events
// =============================================================================

/**
 * Events emitted by a TTS WebSocket connection.
 */
export type TtsConnectionEvents = {
  /**
   * A connection-level error occurred. Always a {@link RealtimeError}
   * subclass (e.g. {@link ConnectionError}, {@link NetworkError},
   * {@link AuthError}).
   */
  error: (error: RealtimeError) => void;
  /** The WebSocket connection was closed. */
  close: () => void;
};

/**
 * Options for creating a TTS connection.
 */
export type TtsConnectionOptions = {
  /**
   * Interval for sending keepalive messages (milliseconds).
   * @default 5000
   * @minimum 1000
   */
  keepalive_interval_ms?: number | undefined;

  /**
   * Maximum time to wait for the WebSocket connection to open (milliseconds).
   * @default 20000
   */
  connect_timeout_ms?: number | undefined;
};

// =============================================================================
// TTS Stream Events
// =============================================================================

/**
 * Events emitted by a TTS stream.
 */
export type TtsStreamEvents = {
  /** Decoded audio chunk received. */
  audio: (chunk: Uint8Array) => void;
  /** Server marked the final audio payload for this stream. */
  audioEnd: () => void;
  /** Stream has been fully terminated by the server. */
  terminated: () => void;
  /**
   * A stream-level error occurred. Always a {@link RealtimeError}
   * subclass mapped from the server `error_code` / `error_message`.
   */
  error: (error: RealtimeError) => void;
};

/**
 * Lifecycle states for a TTS stream.
 */
export type TtsStreamState = 'active' | 'finishing' | 'ended' | 'error';

// =============================================================================
// TTS Server Event
// =============================================================================

/**
 * Raw JSON event received from the TTS WebSocket server.
 */
export type TtsEvent = {
  stream_id?: string | undefined;
  audio?: string | undefined;
  audio_end?: boolean | undefined;
  terminated?: boolean | undefined;
  error_code?: number | undefined;
  error_message?: string | undefined;
};

// =============================================================================
// TTS REST Generation Options
// =============================================================================

/**
 * Options for REST TTS generation (`generate` / `generateStream`).
 */
export type GenerateSpeechOptions = {
  /** Input text to generate as speech. */
  text: string;
  /** Text-to-Speech model to use. @default 'tts-rt-v1' */
  model?: string | undefined;
  /** Language code. @default 'en' */
  language?: string | undefined;
  /** Voice identifier. */
  voice: string;
  /**
   * Output audio format
   * @default 'wav'
   */
  audio_format?: string | undefined;
  /** Output sample rate in Hz. Required for raw PCM formats. */
  sample_rate?: number | undefined;
  /** Codec bitrate in bps (for compressed formats). */
  bitrate?: number | undefined;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal | undefined;
};

// =============================================================================
// TTS Models
// =============================================================================

/**
 * A Text-to-Speech voice.
 */
export type TtsVoice = {
  /** Unique identifier of the voice. */
  id: string;
};

/**
 * A Text-to-Speech model.
 */
export type TtsModel = {
  /** Unique identifier of the model. */
  id: string;
  /** If this is an alias, the id of the aliased model. */
  aliased_model_id?: string | null;
  /** Name of the model. */
  name: string;
  /** Voices supported by this model. */
  voices: TtsVoice[];
};
