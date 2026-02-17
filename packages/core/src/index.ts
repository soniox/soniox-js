/**
 * @soniox/core
 *
 * Shared internals for @soniox/node and @soniox/client.
 */

// Base error
export { SonioxError } from './errors.js';

// Segment utility
export { segmentTokens } from './segments.js';

// Real-time module
export {
  RealtimeSttSession,
  segmentRealtimeTokens,
  RealtimeSegmentBuffer,
  RealtimeUtteranceBuffer,
  TypedEmitter,
  AsyncEventQueue,
  RealtimeError,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  AbortError,
  StateError,
  mapErrorResponse,
} from './realtime/index.js';

// Types
export type {
  RealtimeErrorCode,
  SonioxErrorCode,
  AudioData,
  AudioFormat,
  RealtimeEvent,
  RealtimeResult,
  RealtimeSegment,
  RealtimeSegmentBufferOptions,
  RealtimeSegmentOptions,
  RealtimeToken,
  RealtimeUtterance,
  RealtimeUtteranceBufferOptions,
  SegmentGroupKey,
  SendStreamOptions,
  SttSessionConfig,
  SttSessionEvents,
  SttSessionOptions,
  SttSessionState,
  TranscriptionContext,
  TranslationConfig,
  ContextGeneralEntry,
  ContextTranslationTerm,
  OneWayTranslationConfig,
  TwoWayTranslationConfig,
} from './types/index.js';
