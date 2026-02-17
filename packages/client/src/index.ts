/**
 * @soniox/client
 *
 * Official Soniox SDK for client-side applications
 */

// Client
export { SonioxClient } from './client.js';
export type { SonioxClientOptions, SttOptions } from './client.js';

// Recording
export { Recording } from './recording.js';
export type { RecordingState, RecordingEvents, RecordOptions } from './recording.js';

// Auth
export { resolveApiKey } from './auth.js';
export type { ApiKeyConfig } from './auth.js';

// Audio sources
export type { AudioSource, AudioSourceHandlers } from './audio/types.js';
export { MicrophoneSource } from './audio/microphone.js';
export type { MicrophoneSourceOptions } from './audio/microphone.js';

// Audio errors
export { AudioPermissionError, AudioDeviceError, AudioUnavailableError } from './audio/errors.js';

// Permissions
export type { PermissionResolver, PermissionResult, PermissionStatus, PermissionType } from './permissions/types.js';
export { BrowserPermissionResolver } from './permissions/browser.js';

// Realtime session (from @soniox/core)
export { RealtimeSttSession } from '@soniox/core';
export { segmentRealtimeTokens } from '@soniox/core';
export { RealtimeSegmentBuffer } from '@soniox/core';
export { RealtimeUtteranceBuffer } from '@soniox/core';

// Realtime emitter utility (from @soniox/core)
export { TypedEmitter } from '@soniox/core';

// Errors (from @soniox/core)
export {
  SonioxError,
  RealtimeError,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  AbortError,
  StateError,
} from '@soniox/core';

// Types (from @soniox/core)
export type {
  SttSessionConfig,
  SttSessionState,
  SttSessionEvents,
  SttSessionOptions,
  RealtimeToken,
  RealtimeResult,
  RealtimeSegment,
  RealtimeEvent,
  RealtimeSegmentOptions,
  RealtimeSegmentBufferOptions,
  RealtimeUtterance,
  RealtimeUtteranceBufferOptions,
  AudioFormat,
  AudioData,
  SendStreamOptions,
  TranscriptionContext,
  TranslationConfig,
  SegmentGroupKey,
  RealtimeErrorCode,
  SonioxErrorCode,
  ContextGeneralEntry,
  ContextTranslationTerm,
  OneWayTranslationConfig,
  TwoWayTranslationConfig,
} from '@soniox/core';

// Audio error types (client-specific)
export type { AudioErrorCode } from './audio/errors.js';
