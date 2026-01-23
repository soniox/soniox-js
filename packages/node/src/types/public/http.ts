/**
 * HTTP Client types for the Soniox SDK
 *
 * These types define the pluggable HTTP transport layer, allowing users to
 * swap out the default fetch-based implementation for custom clients
 * (e.g., undici, axios, or your own fetch implementation).
 *
 * @example
 * ```typescript
 * import type { HttpClient, HttpRequest, HttpResponse } from '@soniox/node';
 *
 * // Custom HttpClient implementation
 * class CustomHttpClient implements HttpClient {
 *   async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
 *     // Custom implementation using undici, axios, etc.
 *   }
 * }
 *
 * const client = new SonioxClient({
 *   httpClient: new CustomHttpClient()
 * });
 * ```
 */

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * Response types
 */
export type HttpResponseType = 'json' | 'text' | 'arrayBuffer';

/**
 * Request body types
 */
export type HttpRequestBody =
  | string
  | Record<string, unknown>
  | ArrayBuffer
  | Uint8Array
  | FormData
  | null;

/**
 * Query parameters
 */
export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * HTTP request configuration
 */
export interface HttpRequest {
  /** HTTP method */
  method: HttpMethod;
  /**
   * URL path (relative to baseUrl) or absolute URL
   */
  path: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters (will be URL-encoded) */
  query?: QueryParams;
  /** Request body */
  body?: HttpRequestBody;
  /**
   * Expected response type
   * @default 'json'
   */
  responseType?: HttpResponseType;
  /**
   * Request timeout in milliseconds
   * If not specified, uses the client's default timeout
   */
  timeoutMs?: number;
  /**
   * Optional AbortSignal for request cancellation
   * If provided along with timeoutMs, both will be respected
   */
  signal?: AbortSignal;
}

/**
 * HTTP response from the client
 */
export interface HttpResponse<T> {
  /** HTTP status code */
  status: number;
  /** Response headers (normalized to lowercase keys) */
  headers: Record<string, string>;
  /** Parsed response data */
  data: T;
}

/**
 * Error codes for HTTP client errors
 */
export type HttpErrorCode =
  | 'network_error'
  | 'timeout'
  | 'aborted'
  | 'http_error'
  | 'parse_error';

/**
 * Error details for SonioxHttpError
 */
export interface HttpErrorDetails {
  code: HttpErrorCode;
  message: string;
  url: string;
  method: HttpMethod;
  status?: number | undefined;
  headers?: Record<string, string> | undefined;
  /** Response body text (capped at 4KB) */
  bodyText?: string | undefined;
  cause?: unknown;
}

/**
 * Metadata provided to observability hooks
 */
export interface HttpRequestMeta {
  /** Request start timestamp (Date.now()) */
  startTime: number;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
}

/**
 * Metadata provided to response/error hooks
 */
export interface HttpResponseMeta extends HttpRequestMeta {
  /** Request duration in milliseconds */
  durationMs: number;
  /** Response status code (if available) */
  status?: number;
}

/**
 * Observability hooks for monitoring HTTP requests
 */
export interface HttpObservabilityHooks {
  /**
   * Called before a request is sent
   */
  onRequest?: (request: HttpRequest, meta: HttpRequestMeta) => void;
  /**
   * Called after a successful response is received
   */
  onResponse?: <T>(response: HttpResponse<T>, meta: HttpResponseMeta) => void;
  /**
   * Called when an error occurs
   */
  onError?: (error: Error, meta: HttpResponseMeta) => void;
}

/**
 * Configuration options for the HTTP client
 */
export interface HttpClientOptions {
  /**
   * Base URL for all requests
   * @example 'https://api.soniox.com/v1'
   */
  baseUrl?: string;
  /**
   * Default headers to include in all requests
   */
  defaultHeaders?: Record<string, string>;
  /**
   * Default timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  defaultTimeoutMs?: number;
  /**
   * Observability hooks for monitoring requests
   */
  hooks?: HttpObservabilityHooks;
  /**
   * Custom fetch implementation
   * Defaults to global fetch
   */
  fetch?: typeof fetch;
}

/**
 * Pluggable HTTP client interface
 */
export interface HttpClient {
  /**
   * Perform an HTTP request
   *
   * @param request - Request configuration
   * @returns Promise resolving to the response
   * @throws {SonioxHttpError} On network errors, timeouts, HTTP errors, or parse errors
   */
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>;
}
