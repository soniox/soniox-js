import type { SttSessionConfig, SttSessionOptions, TtsConnectionOptions, TtsStreamConfig } from '@soniox/core';

// Re-export all shared real-time types from @soniox/core
export type {
  AudioFormat,
  SttSessionConfig,
  SttSessionOptions,
  RealtimeToken,
  RealtimeSegment,
  RealtimeSegmentOptions,
  RealtimeSegmentBufferOptions,
  RealtimeUtterance,
  RealtimeUtteranceBufferOptions,
  RealtimeResult,
  RealtimeEvent,
  SttSessionState,
  SttSessionEvents,
  SendStreamOptions,
  SegmentGroupKey,
  TranscriptionContext,
  TranslationConfig,
} from '@soniox/core';

// =============================================================================
// Audio Data Types (Node-specific: includes Buffer)
// =============================================================================

/**
 * Audio data types accepted by sendAudio.
 * In Node.js, Buffer is also accepted since Buffer extends Uint8Array.
 */
export type AudioData = Buffer | Uint8Array | ArrayBuffer;

// =============================================================================
// Real-time Client Options (Node-specific)
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
   * STT WebSocket base URL for real-time connections.
   * @default 'wss://stt-rt.soniox.com/transcribe-websocket'
   */
  ws_base_url: string;

  /**
   * TTS WebSocket URL for real-time connections.
   * @default 'wss://tts-rt.soniox.com/tts-websocket'
   */
  tts_ws_url: string;

  /**
   * STT session config defaults. Merged as the base layer when opening
   * STT sessions via `realtime.stt(config)`; caller fields override.
   */
  stt_defaults?: Partial<SttSessionConfig> | undefined;

  /**
   * TTS stream config defaults. Merged as the base layer when opening
   * TTS streams via `realtime.tts(...)`; caller fields override.
   */
  tts_defaults?: Partial<TtsStreamConfig> | undefined;

  /**
   * Default TTS connection options.
   */
  tts_connection_options?: TtsConnectionOptions | undefined;

  /**
   * Default session options applied to all real-time STT sessions.
   * Can be overridden per-session.
   */
  default_session_options?: SttSessionOptions | undefined;
};
