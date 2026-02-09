/**
 * Default fetch-based HTTP client implementation.
 *
 * @module
 */

import type {
  HttpClient,
  HttpClientOptions,
  HttpObservabilityHooks,
  HttpRequest,
  HttpRequestBody,
  HttpRequestMeta,
  HttpResponse,
  HttpResponseMeta,
  HttpResponseType,
} from './client.js';
import {
  createAbortError,
  createHttpError,
  createNetworkError,
  createParseError,
  createTimeoutError,
  isAbortError,
  SonioxHttpError,
} from './errors.js';
import { buildUrl, mergeHeaders, normalizeHeaders } from './url.js';

/** Default timeout in milliseconds (30 seconds) TODO: Move to constants? */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Determines the Content-Type header based on the body type.
 */
function getContentTypeForBody(body: HttpRequestBody | undefined): string | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return 'text/plain; charset=utf-8';
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    // Let the browser/runtime set the boundary automatically
    return undefined;
  }
  if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
    return 'application/octet-stream';
  }
  // Object/Record - JSON
  return 'application/json';
}

/**
 * Prepares the request body for fetch.
 */
function prepareBody(body: HttpRequestBody | undefined): string | ArrayBuffer | Uint8Array | FormData | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  // Object - serialize to JSON
  return JSON.stringify(body);
}

/**
 * Parses the response based on the expected type.
 */
async function parseResponse<T>(
  response: Response,
  responseType: HttpResponseType,
  url: string,
  method: HttpRequest['method']
): Promise<T> {
  // Handle 204 No Content and empty responses
  const contentLength = response.headers.get('content-length');
  if (response.status === 204 || contentLength === '0') {
    switch (responseType) {
      case 'arrayBuffer':
        return new ArrayBuffer(0) as T;
      case 'text':
        return '' as T;
      case 'json':
      default:
        return null as T;
    }
  }

  switch (responseType) {
    case 'text':
      return (await response.text()) as T;

    case 'arrayBuffer':
      return (await response.arrayBuffer()) as T;

    case 'json':
    default: {
      // Always read as text first so we have the body available for error reporting
      const text = await response.text();
      if (!text) {
        return null as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        throw createParseError(url, method, text, error);
      }
    }
  }
}

/**
 * Default fetch-based HTTP client.
 *
 * @example Basic usage
 * ```typescript
 * const client = new FetchHttpClient({
 *   base_url: 'https://api.example.com/v1',
 *   default_headers: {
 *     'Authorization': 'Bearer token',
 *   },
 * });
 *
 * const response = await client.request<{ users: User[] }>({
 *   method: 'GET',
 *   path: '/users',
 *   query: { active: true },
 * });
 * ```
 *
 * @example With custom fetch (e.g., for testing)
 * ```typescript
 * const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
 * const client = new FetchHttpClient({
 *   base_url: 'https://api.example.com',
 *   fetch: mockFetch,
 * });
 * ```
 *
 * @example Sending different body types
 * ```typescript
 * // JSON body (default for objects)
 * await client.request({
 *   method: 'POST',
 *   path: '/data',
 *   body: { name: 'test', value: 123 },
 * });
 *
 * // Text body
 * await client.request({
 *   method: 'POST',
 *   path: '/text',
 *   body: 'plain text content',
 *   headers: { 'Content-Type': 'text/plain' },
 * });
 *
 * // Binary body
 * await client.request({
 *   method: 'POST',
 *   path: '/upload',
 *   body: new Uint8Array([1, 2, 3]),
 * });
 *
 * // FormData (for file uploads)
 * const formData = new FormData();
 * formData.append('file', fileBlob, 'document.pdf');
 * await client.request({
 *   method: 'POST',
 *   path: '/files',
 *   body: formData,
 * });
 * ```
 */
export class FetchHttpClient implements HttpClient {
  private readonly baseUrl: string | undefined;
  private readonly defaultHeaders: Record<string, string>;
  private readonly defaultTimeoutMs: number;
  private readonly hooks: HttpObservabilityHooks;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.base_url;
    this.defaultHeaders = options.default_headers ?? {};
    this.defaultTimeoutMs = options.default_timeout_ms ?? DEFAULT_TIMEOUT_MS;
    this.hooks = options.hooks ?? {};
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (!this.fetchImpl) {
      throw new Error('fetch is not available. Please provide a fetch implementation via options.fetch');
    }
  }

  /**
   * Performs an HTTP request.
   *
   * @param request - Request configuration
   * @returns Promise resolving to the response
   * @throws {SonioxHttpError}
   */
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    const url = buildUrl(this.baseUrl, request.path, request.query);
    const method = request.method;
    const responseType: HttpResponseType = request.responseType ?? 'json';

    // Prepare headers
    const contentTypeHeader = getContentTypeForBody(request.body);
    const isFormData = typeof FormData !== 'undefined' && request.body instanceof FormData;

    const defaultHeadersWithoutContentType = isFormData
      ? Object.fromEntries(Object.entries(this.defaultHeaders).filter(([key]) => key.toLowerCase() !== 'content-type'))
      : this.defaultHeaders;

    const headers = mergeHeaders(
      defaultHeadersWithoutContentType,
      contentTypeHeader ? { 'Content-Type': contentTypeHeader } : undefined,
      request.headers
    );

    // Create metadata for hooks
    const requestMeta: HttpRequestMeta = {
      startTime,
      url,
      method,
      headers,
    };

    // Call onRequest hook
    this.hooks.onRequest?.(request, requestMeta);

    // Setup timeout
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timeoutController.abort(new Error('Request timeout'));
      }, timeoutMs);
    }

    // Combine timeout signal with user-provided signal
    const combined = request.signal ? combineAbortSignals(timeoutController.signal, request.signal) : null;
    const signal = combined ? combined.signal : timeoutController.signal;

    try {
      // Perform the fetch
      const preparedBody = prepareBody(request.body);
      const response = await this.fetchImpl(url, {
        method,
        headers,
        signal,
        ...(preparedBody !== undefined && { body: preparedBody }),
      });

      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Normalize response headers
      const responseHeaders = normalizeHeaders(response.headers);

      // Check for HTTP errors (non-2xx status)
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw createHttpError(url, method, response.status, responseHeaders, bodyText);
      }

      // Parse response
      const data = await parseResponse<T>(response, responseType, url, method);

      const result: HttpResponse<T> = {
        status: response.status,
        headers: responseHeaders,
        data,
      };

      // Call onResponse hook
      const responseMeta: HttpResponseMeta = {
        ...requestMeta,
        durationMs: Date.now() - startTime,
        status: response.status,
      };
      this.hooks.onResponse?.(result, responseMeta);

      return result;
    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Calculate duration for error hook
      const errorMeta: HttpResponseMeta = {
        ...requestMeta,
        durationMs: Date.now() - startTime,
      };

      // Normalize error
      const normalizedError = this.normalizeError(error, url, method, timeoutMs, timeoutController);

      // Call onError hook
      this.hooks.onError?.(normalizedError, errorMeta);

      throw normalizedError;
    } finally {
      combined?.cleanup();
    }
  }

  /**
   * Normalizes various error types into SonioxHttpError.
   */
  private normalizeError(
    error: unknown,
    url: string,
    method: HttpRequest['method'],
    timeoutMs: number,
    timeoutController: AbortController
  ): SonioxHttpError {
    // Already a SonioxHttpError
    if (error instanceof SonioxHttpError) {
      return error;
    }

    // Check if this was our timeout
    if (timeoutController.signal.aborted && isAbortError(error)) {
      return createTimeoutError(url, method, timeoutMs);
    }

    // User-initiated abort
    if (isAbortError(error)) {
      return createAbortError(url, method, error);
    }

    // Network error (TypeError from fetch usually indicates network issues)
    if (error instanceof TypeError) {
      return createNetworkError(url, method, error);
    }

    // Generic error - treat as network error
    return createNetworkError(url, method, error);
  }
}

/**
 * Combines multiple AbortSignals into one.
 * The resulting signal will abort if any of the input signals abort.
 * Returns the combined signal and a cleanup function to remove listeners.
 */
function combineAbortSignals(...signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const handlers: Array<{ signal: AbortSignal; handler: () => void }> = [];

  const cleanup = () => {
    for (const { signal, handler } of handlers) {
      signal.removeEventListener('abort', handler);
    }
    handlers.length = 0;
  };

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return { signal: controller.signal, cleanup };
    }

    const handler = () => {
      controller.abort(signal.reason);
    };
    handlers.push({ signal, handler });
    signal.addEventListener('abort', handler, { once: true });
  }

  return { signal: controller.signal, cleanup };
}
