// Import and re-export HTTP types
import type { HttpClient } from './http.js';
import type { SttSessionOptions } from './realtime.js';

export type {
    HttpClient,
    HttpClientOptions,
    HttpErrorCode,
    HttpErrorDetails,
    HttpMethod,
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
    SonioxFileData,
    UploadFileInput,
    UploadFileOptions,
} from './files.js';

// Import and re-export Models API types
export type {
    SonioxLanguage,
    SonioxModel,
    SonioxTranscriptionMode,
    SonioxTranslationTarget,
} from './models.js';

// Import and re-export Transcriptions API types
export type {
    CleanupTarget,
    ContextGeneralEntry,
    ContextTranslationTerm,
    CreateTranscriptionOptions,
    ListTranscriptionsOptions,
    ListTranscriptionsResponse,
    OneWayTranslationConfig,
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

// Import and re-export Realtime types
export type {
    AudioData,
    AudioFormat,
    RealtimeClientOptions,
    RealtimeEvent,
    RealtimeResult,
    RealtimeToken,
    SttSessionConfig,
    SttSessionEvents,
    SttSessionOptions,
    SttSessionState,
} from './realtime.js';

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
     * @maxLength 255
     */
    client_reference_id?: string;
}

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
}

/**
 * Realtime configuration options for the main client.
 */
export type RealtimeOptions = {
    /**
     * WebSocket base URL for realtime connections.
     * Falls back to SONIOX_WS_URL environment variable,
     * then to 'wss://stt-rt.soniox.com/transcribe-websocket'.
     */
    wsBaseUrl?: string | undefined;

    /**
     * Default session options applied to all realtime sessions.
     * Can be overridden per-session.
     */
    defaultSessionOptions?: SttSessionOptions | undefined;
};

export type SonioxNodeClientOptions = {
    /**
     * API key for authentication.
     * Falls back to SONIOX_API_KEY environment variable if not provided.
     */
    apiKey?: string;

    /**
     * Base URL for the REST API.
     * Falls back to SONIOX_API_BASE_URL environment variable,
     * then to 'https://api.soniox.com'.
     */
    baseURL?: string;

    /**
     * Custom HTTP client implementation.
     */
    httpClient?: HttpClient;

    /**
     * Realtime API configuration options.
     */
    realtime?: RealtimeOptions;
}