import type { SonioxRegion, SttSessionConfig, TtsConnectionOptions, TtsStreamConfig } from '@soniox/core';

// Import and re-export HTTP types
import type { HttpClient } from './http.js';
import type { SttSessionOptions } from './realtime.js';

// Connection config types (from @soniox/core)
export type { SonioxRegion, SonioxConnectionConfig, ResolvedConnectionConfig } from '@soniox/core';
export { resolveConnectionConfig } from '@soniox/core';

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
  DeleteAllFilesOptions,
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
  DeleteAllTranscriptionsOptions,
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

// Import and re-export TTS types
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
} from './tts.js';

export type TemporaryApiKeyUsageType = 'transcribe_websocket' | 'tts_rt';

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
   * STT WebSocket base URL for real-time connections.
   * Falls back to SONIOX_WS_URL environment variable,
   * then to 'wss://stt-rt.soniox.com/transcribe-websocket'.
   */
  ws_base_url?: string | undefined;

  /**
   * TTS WebSocket URL for real-time connections.
   * Falls back to SONIOX_TTS_WS_URL environment variable,
   * then to 'wss://tts-rt.soniox.com/tts-websocket'.
   */
  tts_ws_url?: string | undefined;

  /**
   * Default TTS connection options (keepalive interval, connect timeout).
   */
  tts_connection_options?: TtsConnectionOptions | undefined;

  /**
   * Default session options applied to all real-time STT sessions.
   * Can be overridden per-session.
   */
  default_session_options?: SttSessionOptions | undefined;

  /**
   * Default STT session config fields (model, language hints, context, etc.).
   *
   * Merged as the base layer when opening STT sessions via
   * `client.realtime.stt(config)`. Fields on the caller-provided `config`
   * override these defaults. Equivalent to
   * {@link SonioxConnectionConfig.stt_defaults} on the web/react clients.
   */
  stt_defaults?: Partial<SttSessionConfig> | undefined;

  /**
   * Default TTS stream config fields (model, voice, language, audio_format, etc.).
   *
   * Merged as the base layer when opening TTS streams via
   * `client.realtime.tts(...)`. Fields on the caller-provided
   * {@link TtsStreamInput} override these defaults. Equivalent to
   * {@link SonioxConnectionConfig.tts_defaults} on the web/react clients.
   */
  tts_defaults?: Partial<TtsStreamConfig> | undefined;
};

export type SonioxNodeClientOptions = {
  /**
   * API key for authentication.
   * Falls back to SONIOX_API_KEY environment variable if not provided.
   */
  api_key?: string;

  /**
   * Deployment region. Determines which regional endpoints are used
   * for both the REST API and real-time WebSocket connections.
   *
   * Leave `undefined` for the default (US) region.
   * Shorthand for `base_domain: '{region}.soniox.com'`.
   * `base_domain` takes precedence when both are provided.
   *
   * @see https://soniox.com/docs/stt/data-residency
   */
  region?: SonioxRegion | undefined;

  /**
   * Base domain for all Soniox service URLs.
   *
   * A single override that derives all service endpoints from the pattern
   * `{service}.{base_domain}`. Takes precedence over `region`.
   * Falls back to SONIOX_BASE_DOMAIN environment variable.
   * Individual URL fields (`base_url`, `tts_api_url`, `realtime.ws_base_url`,
   * `realtime.tts_ws_url`) still take final precedence.
   *
   * @example 'eu.soniox.com'
   */
  base_domain?: string | undefined;

  /**
   * Base URL for the REST API.
   * Falls back to SONIOX_API_BASE_URL environment variable,
   * then to the region-derived URL, then to 'https://api.soniox.com'.
   */
  base_url?: string;

  /**
   * TTS REST API URL.
   * Falls back to SONIOX_TTS_API_URL environment variable,
   * then to the region-derived URL, then to 'https://tts-rt.soniox.com'.
   */
  tts_api_url?: string;

  /**
   * Custom HTTP client implementation.
   */
  http_client?: HttpClient;

  /**
   * Default STT session config fields applied to every real-time STT session
   * opened via `client.realtime.stt(config)`. Caller-provided fields override.
   *
   * Equivalent to {@link SonioxConnectionConfig.stt_defaults} on the
   * web/react clients. Prefer this when you want the same defaults
   * across your whole Node process.
   */
  stt_defaults?: Partial<SttSessionConfig> | undefined;

  /**
   * Default TTS stream config fields applied to every real-time TTS stream
   * opened via `client.realtime.tts(...)`. Caller-provided fields override.
   *
   * Equivalent to {@link SonioxConnectionConfig.tts_defaults} on the
   * web/react clients.
   */
  tts_defaults?: Partial<TtsStreamConfig> | undefined;

  /**
   * Real-time API configuration options.
   */
  realtime?: RealtimeOptions;
};
