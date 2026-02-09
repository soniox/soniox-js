import type { SegmentGroupKey, TranscriptionContext, TranslationConfig } from './transcriptions.js';

// Re-export for convenience
export type { SegmentGroupKey, TranscriptionContext, TranslationConfig };

// =============================================================================
// Audio Format
// =============================================================================

/**
 * Supported audio formats for real-time transcription.
 */
export type AudioFormat =
  | 'pcm_s8'
  | 'pcm_s8le'
  | 'pcm_s8be'
  | 'pcm_s16le'
  | 'pcm_s16be'
  | 'pcm_s24le'
  | 'pcm_s24be'
  | 'pcm_s32le'
  | 'pcm_s32be'
  | 'pcm_u8'
  | 'pcm_u8le'
  | 'pcm_u8be'
  | 'pcm_u16le'
  | 'pcm_u16be'
  | 'pcm_u24le'
  | 'pcm_u24be'
  | 'pcm_u32le'
  | 'pcm_u32be'
  | 'pcm_f32le'
  | 'pcm_f32be'
  | 'pcm_f64le'
  | 'pcm_f64be'
  | 'mulaw'
  | 'alaw'
  | 'aac'
  | 'aiff'
  | 'amr'
  | 'asf'
  | 'wav'
  | 'mp3'
  | 'flac'
  | 'ogg'
  | 'webm';

// =============================================================================
// Session Configuration (sent to server)
// =============================================================================

/**
 * Configuration sent to the Soniox WebSocket API when starting a session.
 */
export type SttSessionConfig = {
  /**
   * Speech-to-text model to use.
   */
  model: string;

  /**
   * Audio format. Use 'auto' for automatic detection of container formats.
   * For raw PCM formats, also set sample_rate and num_channels.
   * @default 'auto'
   */
  audio_format?: 'auto' | AudioFormat | undefined;

  /**
   * Sample rate in Hz (required for PCM formats).
   */
  sample_rate?: number | undefined;

  /**
   * Number of audio channels (required for raw audio formats).
   */
  num_channels?: number | undefined;

  /**
   * Expected languages in the audio (ISO language codes).
   */
  language_hints?: string[] | undefined;

  /**
   * When true, recognition is strongly biased toward language hints.
   * Best-effort only, not a hard guarantee.
   */
  language_hints_strict?: boolean | undefined;

  /**
   * Enable speaker identification.
   */
  enable_speaker_diarization?: boolean | undefined;

  /**
   * Enable automatic language detection.
   */
  enable_language_identification?: boolean | undefined;

  /**
   * Enable endpoint detection for utterance boundaries.
   * Useful for voice AI agents.
   */
  enable_endpoint_detection?: boolean | undefined;

  /**
   * Optional tracking identifier (max 256 chars).
   */
  client_reference_id?: string | undefined;

  /**
   * Additional context to improve transcription accuracy.
   */
  context?: TranscriptionContext | undefined;

  /**
   * Translation configuration.
   */
  translation?: TranslationConfig | undefined;
};

// =============================================================================
// Session Options (SDK-level, not sent to server)
// =============================================================================

/**
 * SDK-level session options (not sent to the server).
 */
export type SttSessionOptions = {
  /**
   * AbortSignal for cancellation.
   */
  signal?: AbortSignal | undefined;

  /**
   * When true, sends keepalive messages while connected (not only when paused).
   * @default false
   */
  keepalive?: boolean | undefined;

  /**
   * Interval for sending keepalive messages while connected or paused (milliseconds).
   * @default 5000
   */
  keepalive_interval_ms?: number | undefined;
};

// =============================================================================
// Result Types
// =============================================================================

/**
 * A single token from the real-time transcription.
 */
export type RealtimeToken = {
  /**
   * The transcribed text.
   */
  text: string;

  /**
   * Start time in milliseconds relative to audio start.
   */
  start_ms?: number | undefined;

  /**
   * End time in milliseconds relative to audio start.
   */
  end_ms?: number | undefined;

  /**
   * Confidence score (0.0 to 1.0).
   */
  confidence: number;

  /**
   * Whether this is a finalized token.
   */
  is_final: boolean;

  /**
   * Speaker identifier (if diarization enabled).
   */
  speaker?: string | undefined;

  /**
   * Detected language code (if language identification enabled).
   */
  language?: string | undefined;

  /**
   * Translation status of this token.
   */
  translation_status?: 'none' | 'original' | 'translation' | undefined;

  /**
   * Source language for translated tokens.
   */
  source_language?: string | undefined;
};

/**
 * A segment of contiguous real-time tokens grouped by speaker/language.
 */
export type RealtimeSegment = {
  /**
   * Concatenated text of all tokens in this segment.
   */
  text: string;

  /**
   * Start time of the segment in milliseconds (from first token).
   */
  start_ms?: number | undefined;

  /**
   * End time of the segment in milliseconds (from last token).
   */
  end_ms?: number | undefined;

  /**
   * Speaker identifier (if diarization enabled).
   */
  speaker?: string | undefined;

  /**
   * Detected language code (if language identification enabled).
   */
  language?: string | undefined;

  /**
   * Original tokens in this segment.
   */
  tokens: RealtimeToken[];
};

/**
 * Options for segmenting real-time tokens.
 */
export type RealtimeSegmentOptions = {
  /**
   * Fields to group by. A new segment starts when any of these fields changes
   * @default ['speaker', 'language']
   */
  group_by?: SegmentGroupKey[] | undefined;

  /**
   * When true, only tokens marked as final are included.
   * @default false
   */
  final_only?: boolean | undefined;
};

/**
 * Options for rolling real-time segmentation buffers.
 */
export type RealtimeSegmentBufferOptions = {
  /**
   * Fields to group by. A new segment starts when any of these fields changes
   * @default ['speaker', 'language']
   */
  group_by?: SegmentGroupKey[] | undefined;

  /**
   * When true, only tokens marked as final are buffered.
   * @default true
   */
  final_only?: boolean | undefined;

  /**
   * Maximum number of tokens to keep in the buffer.
   * @default 2000
   */
  max_tokens?: number | undefined;

  /**
   * Maximum time window to keep in milliseconds (requires token timings).
   */
  max_ms?: number | undefined;
};

/**
 * A single utterance built from real-time segments.
 */
export type RealtimeUtterance = {
  /**
   * Concatenated text of all segments in this utterance.
   */
  text: string;

  /**
   * Segments included in this utterance.
   */
  segments: RealtimeSegment[];

  /**
   * Tokens included in this utterance.
   */
  tokens: RealtimeToken[];

  /**
   * Start time of the utterance in milliseconds (from first segment).
   */
  start_ms?: number | undefined;

  /**
   * End time of the utterance in milliseconds (from last segment).
   */
  end_ms?: number | undefined;

  /**
   * Speaker identifier when consistent across segments.
   */
  speaker?: string | undefined;

  /**
   * Detected language code when consistent across segments.
   */
  language?: string | undefined;

  /**
   * Milliseconds of audio that have been finalized at flush time.
   */
  final_audio_proc_ms?: number | undefined;

  /**
   * Total milliseconds of audio processed at flush time.
   */
  total_audio_proc_ms?: number | undefined;
};

/**
 * Options for buffering real-time utterances.
 */
export type RealtimeUtteranceBufferOptions = {
  /**
   * Fields to group by. A new segment starts when any of these fields changes
   * @default ['speaker', 'language']
   */
  group_by?: SegmentGroupKey[] | undefined;

  /**
   * When true, only tokens marked as final are buffered.
   * @default true
   */
  final_only?: boolean | undefined;

  /**
   * Maximum number of tokens to keep in the buffer.
   * @default 2000
   */
  max_tokens?: number | undefined;

  /**
   * Maximum time window to keep in milliseconds (requires token timings).
   */
  max_ms?: number | undefined;
};

/**
 * A result message from the real-time WebSocket.
 */
export type RealtimeResult = {
  /**
   * Tokens in this result.
   */
  tokens: RealtimeToken[];

  /**
   * Milliseconds of audio that have been finalized.
   */
  final_audio_proc_ms: number;

  /**
   * Total milliseconds of audio processed.
   */
  total_audio_proc_ms: number;

  /**
   * Whether this is the final result (session ending).
   */
  finished?: boolean | undefined;
};

// =============================================================================
// Event Types
// =============================================================================

/**
 * Typed event for async iterator consumption.
 */
export type RealtimeEvent =
  | { kind: 'result'; data: RealtimeResult }
  | { kind: 'endpoint' }
  | { kind: 'finalized' }
  | { kind: 'finished' };

// =============================================================================
// Session State
// =============================================================================

/**
 * Session lifecycle states.
 */
export type SttSessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'finishing'
  | 'finished'
  | 'canceled'
  | 'closed'
  | 'error';

// =============================================================================
// Session Events
// =============================================================================

/**
 * Event handlers for the STT session.
 */
export type SttSessionEvents = {
  /**
   * Parsed result received.
   */
  result: (result: RealtimeResult) => void;

  /**
   * Individual token received.
   */
  token: (token: RealtimeToken) => void;

  /**
   * Error occurred.
   */
  error: (error: Error) => void;

  /**
   * Endpoint detected (<end> token).
   */
  endpoint: () => void;

  /**
   * Finalization complete (<fin> token).
   */
  finalized: () => void;

  /**
   * Session finished (server signaled end of stream).
   */
  finished: () => void;

  /**
   * Session connected and ready.
   */
  connected: () => void;

  /**
   * Session disconnected.
   */
  disconnected: (reason?: string) => void;

  /**
   * Session state transition.
   */
  state_change: (update: { old_state: SttSessionState; new_state: SttSessionState }) => void;
};

// =============================================================================
// Audio Data Types
// =============================================================================

/**
 * Audio data types accepted by sendAudio.
 */
export type AudioData = Buffer | Uint8Array | ArrayBuffer;

/**
 * Options for streaming audio from an async iterable source.
 */
export type SendStreamOptions = {
  /**
   * Delay in milliseconds between sending chunks.
   * Useful for simulating real-time pace when streaming pre-recorded files.
   * Not needed for live audio sources.
   */
  pace_ms?: number | undefined;

  /**
   * When true, calls finish() automatically after the stream ends.
   * @default false
   */
  finish?: boolean | undefined;
};

// =============================================================================
// Real-time Client Options
// =============================================================================

/**
 * Real-time API configuration options for the client.
 */
export type RealtimeClientOptions = {
  /**
   * API key for real-time sessions.
   */
  api_key: string;

  /**
   * WebSocket base URL for real-time connections.
   * @default 'wss://stt-rt.soniox.com/transcribe-websocket'
   */
  ws_base_url: string;

  /**
   * Default session options applied to all real-time sessions.
   * Can be overridden per-session.
   */
  default_session_options?: SttSessionOptions | undefined;
};
