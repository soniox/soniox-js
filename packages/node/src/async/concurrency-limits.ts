import type { HttpClient } from '../http/client.js';
import type {
  ConcurrencyLimitsResponse,
  ConcurrentStreamsHistoryResponse,
  GetConcurrentStreamsHistoryOptions,
} from '../types/public/index.js';

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

  /**
   * Retrieves historical concurrent stream aggregates for the project.
   *
   * Returns every aggregation period in the requested window (no gaps).
   * Periods with no recorded activity have every numeric field set to `0`.
   *
   * @param options - Required time window, aggregation period, stream kind, and optional cancellation.
   * @returns Concurrent streams history for the requested kind.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const history = await client.concurrencyLimits.getHistory({
   *   start_time: '2026-04-28T09:00:00Z',
   *   end_time: '2026-04-28T10:00:00Z',
   *   period_sec: 60,
   *   kind: 'stt',
   * });
   *
   * for (const entry of history.entries) {
   *   console.log(entry.period_start, entry.sample_max);
   * }
   * ```
   */
  async getHistory(options: GetConcurrentStreamsHistoryOptions): Promise<ConcurrentStreamsHistoryResponse> {
    const { start_time, end_time, period_sec, kind, signal } = options;

    const response = await this.http.request<ConcurrentStreamsHistoryResponse>({
      method: 'GET',
      path: '/v1/concurrent-streams-history',
      query: {
        start_time,
        end_time,
        period_sec,
        kind,
      },
      ...(signal && { signal }),
    });

    return response.data;
  }
}
