import type { SttSessionOptions } from '@soniox/core';

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
