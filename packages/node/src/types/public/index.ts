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

/**
 * Transcription mode of the model.
 */
export type SonioxTranscriptionMode = 'real_time' | 'async';

export type SonioxLanguage = {
    /**
     * 2-letter language code.
     */
    code: string;
    /**
     * Language name.
     */
    name: string;
}

export type SonioxTranslationTarget = {
    target_language: string;
    source_languages: string[];
    exclude_source_languages: string[];
}

export type SonioxModel = {
    /**
     * Unique identifier of the model.
     */
    id: string;
    /**
     * If this is an alias, the id of the aliased model.
     */
    aliased_model_id: string;
    /**
     * Name of the model.
     */
    name: string;
    /**
     * Version of context supported.
     */
    context_version: number;
    /**
     * Transcription mode of the model.
     */
    transcription_mode: SonioxTranscriptionMode;
    /**
     * List of languages supported by the model.
     */
    languages: SonioxLanguage[];

    /**
     * TODO: Add documentation
     */
    supports_language_hints_strict: boolean;

    /**
     * List of supported one-way translation targets. If list is empty, check for one_way_translation field
     */
    translation_targets: SonioxTranslationTarget[];

    /**
     * List of supported two-way translation pairs. If list is empty, check for two_way_translation field
     */
    two_way_translation_pairs: string[];

    /**
     * When contains string 'all_languages', any laguage from languages can be used
     */
    one_way_translation: string;

    /**
     * When contains string 'all_languages',' any laguage pair from languages can be used
     */
    two_way_translation: string;
}

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