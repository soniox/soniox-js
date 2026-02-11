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

// Errors — HTTP
export { SonioxError, SonioxHttpError } from './http/errors.js';

// Errors — Real-time
export {
  RealtimeError,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  AbortError,
  StateError,
} from './realtime/errors.js';

// Public types — Errors
export type {
  SonioxErrorCode,
  HttpErrorCode,
  RealtimeErrorCode,
  HttpMethod,
  HttpErrorDetails,
} from './types/public/index.js';

// Public types — Client & HTTP
export type {
  SonioxNodeClientOptions,
  RealtimeOptions,
  HttpClient,
  HttpRequest,
  HttpResponse,
  HttpRequestBody,
  HttpResponseType,
  QueryParams,
} from './types/public/index.js';

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
  ISonioxTranscript,
  ISonioxTranscription,
} from './types/public/index.js';

// Public types — Models
export type {
  SonioxModel,
  SonioxLanguage,
  SonioxTranscriptionMode,
  SonioxTranslationTarget,
} from './types/public/index.js';

// Public types — Auth
export type {
  TemporaryApiKeyRequest,
  TemporaryApiKeyResponse,
  TemporaryApiKeyUsageType,
} from './types/public/index.js';

// Public types — Webhooks
export type {
  WebhookEvent,
  WebhookEventStatus,
  WebhookAuthConfig,
  WebhookHandlerResult,
  WebhookHandlerResultWithFetch,
  HandleWebhookOptions,
  WebhookHeaders,
  ExpressLikeRequest,
  FastifyLikeRequest,
  HonoLikeContext,
  NestJSLikeRequest,
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
  RealtimeClientOptions,
} from './types/public/index.js';
