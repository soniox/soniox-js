// Import and re-export HTTP types
import type { HttpClient } from './http.js';

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
    ContextGeneralEntry,
    ContextTranslationTerm,
    CreateTranscriptionOptions,
    ListTranscriptionsOptions,
    ListTranscriptionsResponse,
    OneWayTranslationConfig,
    SonioxTranscriptionData,
    TranscribeOptions,
    TranscriptionContext,
    TranscriptionIdentifier,
    TranscriptionStatus,
    TranscriptResponse,
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
    WebhookHeaders,
} from './webhooks.js';

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

export type SonioxNodeClientOptions = {
    /**
     * API key for authentication
     * Falls back to SONIOX_API_KEY environment variable if not provided
     */
    apiKey?: string;

    /**
     * Base URL for the API
     * Falls back to SONIOX_API_BASE_URL environment variable,
     * then to 'https://api.soniox.com'.
     */
    baseURL?: string;

    /**
     * Custom HTTP client implementation
     */
    httpClient?: HttpClient;
}