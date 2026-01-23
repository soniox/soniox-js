/**
 * HTTP client module for the Soniox SDK.
 * @module
 */

// Types
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
} from './client.js';

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
  isSonioxHttpError,
  SonioxError,
  SonioxHttpError,
} from './errors.js';

// URL utilities
export {
  buildUrl,
  mergeHeaders,
  normalizeHeaders,
} from './url.js';
