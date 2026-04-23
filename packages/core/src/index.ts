/**
 * @soniox/core
 *
 * Shared internals for @soniox/node and @soniox/client.
 */

// Base error
export { SonioxError } from './errors.js';

// HTTP error class + helpers (shared between @soniox/node and @soniox/client)
export {
  SonioxHttpError,
  createAbortError,
  createHttpError,
  createNetworkError,
  createParseError,
  createTimeoutError,
  isAbortError,
  isNotFoundError,
  isSonioxError,
  isSonioxHttpError,
} from './http-errors.js';

// Connection config + region resolution
export { resolveConnectionConfig } from './connection.js';
export type { SonioxRegion, SonioxConnectionConfig, ResolvedConnectionConfig, ConfigContext } from './connection.js';

// Segment utility
export { segmentTokens } from './segments.js';

// Real-time STT module
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
  isRetriableError,
} from './realtime/index.js';

// Real-time TTS module
export { RealtimeTtsConnection, RealtimeTtsStream } from './realtime/index.js';

// REST TTS client (browser-safe)
export { TtsRestClient } from './tts-rest.js';

// STT Types
export type {
  RealtimeErrorCode,
  SonioxErrorCode,
  HttpErrorCode,
  HttpErrorDetails,
  HttpMethod,
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
  StateChangeReason,
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

// TTS Types
export type {
  GenerateSpeechOptions,
  TtsAudioFormat,
  TtsConnectionEvents,
  TtsConnectionOptions,
  TtsEvent,
  TtsModel,
  TtsStreamConfig,
  TtsStreamEvents,
  TtsStreamInput,
  TtsStreamState,
  TtsVoice,
} from './types/index.js';
