/**
 * @soniox/node — API Reference
 *
 * @packageDocumentation
 */

// Main client
export { SonioxNodeClient } from './client.js';

// Async API classes (accessed via client properties)
export { SonioxFilesAPI, FileListResult, SonioxFile } from './async/files.js';
export { SonioxSttApi, SonioxTranscript, SonioxTranscription, TranscriptionListResult } from './async/stt.js';
export { SonioxModelsAPI } from './async/models.js';
export { SonioxWebhooksAPI } from './async/webhooks.js';
export { SonioxAuthAPI } from './async/auth.js';

// Real-time API
export {
  SonioxRealtimeApi,
  RealtimeSttSession,
  RealtimeSegmentBuffer,
  RealtimeUtteranceBuffer,
} from './realtime/index.js';

// Public types — Client
export type { SonioxNodeClientOptions, RealtimeOptions } from './types/public/index.js';

// Public types — Files
export type {
  SonioxFileData,
  ListFilesOptions,
  ListFilesResponse,
  FileIdentifier,
  UploadFileInput,
  UploadFileOptions,
  PurgeFilesOptions,
} from './types/public/index.js';

// Public types — Transcriptions
export type {
  TranscriptionStatus,
  SonioxTranscriptionData,
  CreateTranscriptionOptions,
  TranscribeOptions,
  TranscribeFromUrl,
  TranscribeFromFile,
  TranscribeFromFileId,
  TranscribeFromUrlOptions,
  TranscribeFromFileOptions,
  TranscribeFromFileIdOptions,
  TranscribeBaseOptions,
  WaitOptions,
  TranscriptResponse,
  TranscriptToken,
  TranscriptSegment,
  SegmentTranscriptOptions,
  TranscriptionContext,
  ContextGeneralEntry,
  ContextTranslationTerm,
  TranslationConfig,
  OneWayTranslationConfig,
  TwoWayTranslationConfig,
  ListTranscriptionsOptions,
  ListTranscriptionsResponse,
  TranscriptionIdentifier,
  CleanupTarget,
  SegmentGroupKey,
  PurgeTranscriptionsOptions,
  PurgeResult,
} from './types/public/index.js';

// Public types — Models
export type {
  SonioxModel,
  SonioxLanguage,
  SonioxTranscriptionMode,
  SonioxTranslationTarget,
} from './types/public/index.js';

// Public types — Auth
export type { TemporaryApiKeyRequest, TemporaryApiKeyResponse } from './types/public/index.js';

// Public types — Webhooks
export type {
  WebhookEvent,
  WebhookEventStatus,
  WebhookAuthConfig,
  WebhookHandlerResult,
  WebhookHandlerResultWithFetch,
  HandleWebhookOptions,
} from './types/public/index.js';

// Public types — Real-time
export type {
  SttSessionConfig,
  SttSessionOptions,
  SttSessionState,
  SttSessionEvents,
  RealtimeToken,
  RealtimeResult,
  RealtimeSegment,
  RealtimeUtterance,
  RealtimeEvent,
  AudioFormat,
  AudioData,
  SendStreamOptions,
  RealtimeSegmentOptions,
  RealtimeSegmentBufferOptions,
  RealtimeUtteranceBufferOptions,
} from './types/public/index.js';
