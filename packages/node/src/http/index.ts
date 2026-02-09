/**
 * HTTP client module for the Soniox SDK.
 * @module
 */

// Types from client
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
} from './client.js';

// Error types (re-exported from public types)
export type {
  HttpErrorCode,
  HttpErrorDetails,
  HttpMethod,
  RealtimeErrorCode,
  SonioxErrorCode,
} from '../types/public/errors.js';

// Implementation
export { FetchHttpClient } from './fetch-adapter.js';

// Errors
export {
  createAbortError,
  createHttpError,
  createNetworkError,
  createParseError,
  createTimeoutError,
  isAbortError,
  isSonioxError,
  isSonioxHttpError,
  SonioxError,
  SonioxHttpError,
} from './errors.js';

// URL utilities
export { buildUrl, mergeHeaders, normalizeHeaders } from './url.js';
