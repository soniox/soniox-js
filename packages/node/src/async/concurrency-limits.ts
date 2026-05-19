import type { HttpClient } from '../http/client.js';
import type { ConcurrencyLimitsResponse } from '../types/public/index.js';

export class SonioxConcurrencyLimitsAPI {
  constructor(private http: HttpClient) {}

  /**
   * Retrieves current concurrency counts and configured limits.
   *
   * Values are region-scoped according to the client's configured REST API
   * endpoint.
   *
   * @param signal - Optional AbortSignal for cancellation.
   * @returns Current counts and configured limits for project and organization scopes.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const limits = await client.concurrencyLimits.get();
   * console.log(limits.project.current.transcribe_concurrent);
   * console.log(limits.project.limits.transcribe_concurrent);
   * ```
   */
  async get(signal?: AbortSignal): Promise<ConcurrencyLimitsResponse> {
    const response = await this.http.request<ConcurrencyLimitsResponse>({
      method: 'GET',
      path: '/v1/concurrency-limits',
      ...(signal && { signal }),
    });

    return response.data;
  }
}
