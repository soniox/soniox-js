// Import and re-export HTTP types
import type { HttpClient } from './http.js';
import type { SttSessionOptions } from './realtime.js';

// Error types
export type { HttpErrorCode, HttpErrorDetails, HttpMethod, RealtimeErrorCode, SonioxErrorCode } from './errors.js';

export type {
  HttpClient,
  HttpClientOptions,
  HttpObservabilityHooks,
  HttpRequest,
  HttpRequestBody,
  HttpRequestMeta,
  HttpResponse,
  HttpResponseMeta,
  HttpResponseType,
  QueryParams,
} from './http.js';

// Import and re-export Files API types
export type {
  FileIdentifier,
  ListFilesOptions,
  ListFilesResponse,
  PurgeFilesOptions,
  SonioxFileData,
  UploadFileInput,
  UploadFileOptions,
} from './files.js';

// Import and re-export Models API types
export type { SonioxLanguage, SonioxModel, SonioxTranscriptionMode, SonioxTranslationTarget } from './models.js';

// Import and re-export Transcriptions API types
export type {
  CleanupTarget,
  ContextGeneralEntry,
  ContextTranslationTerm,
  CreateTranscriptionOptions,
  ISonioxTranscript,
  ISonioxTranscription,
  ListTranscriptionsOptions,
  ListTranscriptionsResponse,
  OneWayTranslationConfig,
  PurgeTranscriptionsOptions,
  SegmentGroupKey,
  SegmentTranscriptOptions,
  SonioxTranscriptionData,
  TranscribeBaseOptions,
  TranscribeFromFile,
  TranscribeFromFileId,
  TranscribeFromFileIdOptions,
  TranscribeFromFileOptions,
  TranscribeOptions,
  TranscribeFromUrl,
  TranscribeFromUrlOptions,
  TranscriptionContext,
  TranscriptionIdentifier,
  TranscriptionStatus,
  TranscriptResponse,
  TranscriptSegment,
  TranscriptToken,
  TranslationConfig,
  TwoWayTranslationConfig,
  WaitOptions,
} from './transcriptions.js';

// Import and re-export Webhooks types
export type {
  ExpressLikeRequest,
  FastifyLikeRequest,
  HandleWebhookOptions,
  HonoLikeContext,
  NestJSLikeRequest,
  WebhookAuthConfig,
  WebhookEvent,
  WebhookEventStatus,
  WebhookHandlerResult,
  WebhookHandlerResultWithFetch,
  WebhookHeaders,
} from './webhooks.js';

// Import and re-export Real-time types
export type {
  AudioData,
  AudioFormat,
  RealtimeClientOptions,
  RealtimeEvent,
  RealtimeResult,
  RealtimeSegment,
  RealtimeSegmentBufferOptions,
  RealtimeSegmentOptions,
  RealtimeToken,
  RealtimeUtterance,
  RealtimeUtteranceBufferOptions,
  SendStreamOptions,
  SttSessionConfig,
  SttSessionEvents,
  SttSessionOptions,
  SttSessionState,
} from './realtime.js';

/**
 * Result of a purge operation.
 */
export type PurgeResult = {
  /**
   * Number of resources deleted.
   */
  deleted: number;
};

export type TemporaryApiKeyUsageType = 'transcribe_websocket';

export type TemporaryApiKeyRequest = {
  /**
   * Intended usage of the temporary API key.
   */
  usage_type: TemporaryApiKeyUsageType;

  /**
   * Duration in seconds until the temporary API key expires
   * @minimum 1
   * @maximum 3600
   */
  expires_in_seconds: number;

  /**
   * Optional tracking identifier string. Does not need to be unique
   * @maxLength 256
   */
  client_reference_id?: string;
};

export type TemporaryApiKeyResponse = {
  /**
   * Created temporary API key.
   */
  api_key: string;

  /**
   * UTC timestamp indicating when generated temporary API key will expire
   * @format date-time
   */
  expires_at: string;
};

/**
 * Real-time configuration options for the main client.
 */
export type RealtimeOptions = {
  /**
   * WebSocket base URL for real-time connections.
   * Falls back to SONIOX_WS_URL environment variable,
   * then to 'wss://stt-rt.soniox.com/transcribe-websocket'.
   */
  ws_base_url?: string | undefined;

  /**
   * Default session options applied to all real-time sessions.
   * Can be overridden per-session.
   */
  default_session_options?: SttSessionOptions | undefined;
};

export type SonioxNodeClientOptions = {
  /**
   * API key for authentication.
   * Falls back to SONIOX_API_KEY environment variable if not provided.
   */
  api_key?: string;

  /**
   * Base URL for the REST API.
   * Falls back to SONIOX_API_BASE_URL environment variable,
   * then to 'https://api.soniox.com'.
   */
  base_url?: string;

  /**
   * Custom HTTP client implementation.
   */
  http_client?: HttpClient;

  /**
   * Real-time API configuration options.
   */
  realtime?: RealtimeOptions;
};
