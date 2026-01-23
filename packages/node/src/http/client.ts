/**
 * HTTP Client interface for the Soniox SDK.
 *
 * @module
 *
 * @example Using the default FetchHttpClient
 * ```typescript
 * import { FetchHttpClient } from '@soniox/node';
 *
 * const httpClient = new FetchHttpClient({
 *   baseUrl: 'https://api.example.com/v1',
 *   defaultHeaders: {
 *     'Authorization': 'Bearer your-api-key',
 *   },
 *   defaultTimeoutMs: 30000,
 *   hooks: {
 *     onRequest: (req, meta) => console.log(`${meta.method} ${meta.url}`),
 *     onResponse: (res, meta) => console.log(`${meta.status} in ${meta.durationMs}ms`),
 *     onError: (err, meta) => console.error(`Error:`, err.message),
 *   },
 * });
 *
 * // Make a request
 * const response = await httpClient.request<{ data: string[] }>({
 *   method: 'GET',
 *   path: '/items',
 *   query: { page: 1, limit: 10 },
 * });
 * console.log(response.data);
 * ```
 *
 * @example Implementing a custom HttpClient
 * ```typescript
 * import type { HttpClient, HttpRequest, HttpResponse } from '@soniox/node';
 * import { Client } from 'undici';
 *
 * class UndiciHttpClient implements HttpClient {
 *   private client = new Client('https://api.example.com');
 *
 *   async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
 *     const { statusCode, headers, body } = await this.client.request({
 *       method: req.method,
 *       path: req.path,
 *       headers: req.headers,
 *       body: typeof req.body === 'object' ? JSON.stringify(req.body) : req.body,
 *     });
 *
 *     const data = await body.json() as T;
 *
 *     return {
 *       status: statusCode,
 *       headers: headers as Record<string, string>,
 *       data,
 *     };
 *   }
 * }
 * ```
 */

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
} from '../types/public/http.js';
