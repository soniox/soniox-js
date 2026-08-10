import type { HttpClient } from '../http/client.js';
import type {
  GetUsageSummaryOptions,
  ListUsageLogsOptions,
  ListUsageLogsResponse,
  SonioxUsageLog,
  UsageSummaryResponse,
} from '../types/public/index.js';

/**
 * Result set for usage log listing.
 */
export class UsageLogListResult implements AsyncIterable<SonioxUsageLog> {
  /**
   * Usage logs from the first page of results.
   */
  readonly usage_logs: SonioxUsageLog[];

  /**
   * Pagination cursor for the next page. Null if no more pages.
   */
  readonly next_page_cursor: string | null;

  constructor(
    initialResponse: ListUsageLogsResponse,
    private readonly _http: HttpClient,
    private readonly _options: ListUsageLogsOptions
  ) {
    this.usage_logs = initialResponse.usage_logs;
    this.next_page_cursor = initialResponse.next_page_cursor;
  }

  /**
   * Returns the raw data for this list result.
   */
  toJSON(): ListUsageLogsResponse {
    return {
      usage_logs: this.usage_logs,
      next_page_cursor: this.next_page_cursor,
    };
  }

  /**
   * Returns true if there are more pages of results beyond the first page.
   */
  isPaged(): boolean {
    return this.next_page_cursor !== null;
  }

  /**
   * Async iterator that automatically fetches all pages.
   * Use with `for await...of` to iterate through all usage logs.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<SonioxUsageLog> {
    for (const usageLog of this.usage_logs) {
      yield usageLog;
    }

    let cursor = this.next_page_cursor;
    while (cursor !== null) {
      const response = await this._http.request<ListUsageLogsResponse>({
        method: 'GET',
        path: '/v1/usage-logs',
        query: {
          start_time: this._options.start_time,
          end_time: this._options.end_time,
          limit: this._options.limit,
          sort: this._options.sort,
          cursor,
        },
        ...(this._options.signal && { signal: this._options.signal }),
      });

      for (const usageLog of response.data.usage_logs) {
        yield usageLog;
      }

      cursor = response.data.next_page_cursor;
    }
  }
}

export class SonioxUsageLogsAPI {
  constructor(private http: HttpClient) {}

  /**
   * Retrieves per-request usage log entries for the project.
   *
   * The returned result is async iterable. Use `for await...of` to iterate
   * through all pages.
   *
   * @param options - Required time window plus optional pagination, sorting, and cancellation.
   * @returns UsageLogListResult with async iteration support.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const result = await client.usageLogs.list({
   *   start_time: '2026-04-28T09:00:00Z',
   *   end_time: '2026-04-29T09:00:00Z',
   *   sort: 'end_time_desc',
   * });
   *
   * for await (const log of result) {
   *   console.log(log.model, log.cost_usd);
   * }
   * ```
   */
  async list(options: ListUsageLogsOptions): Promise<UsageLogListResult> {
    const { start_time, end_time, limit, sort, cursor, signal } = options;

    const response = await this.http.request<ListUsageLogsResponse>({
      method: 'GET',
      path: '/v1/usage-logs',
      query: {
        start_time,
        end_time,
        limit,
        sort,
        cursor,
      },
      ...(signal && { signal }),
    });

    return new UsageLogListResult(response.data, this.http, options);
  }

  /**
   * Retrieves an aggregated usage summary for the project over a time window.
   *
   * Returns totals across all models plus one entry per model that recorded
   * usage. Per-day series are aligned to each entry's `days` array.
   *
   * @param options - Required time window plus optional cancellation.
   * @returns Aggregated usage summary.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const summary = await client.usageLogs.getSummary({
   *   start_time: '2026-04-01T00:00:00Z',
   *   end_time: '2026-04-03T00:00:00Z',
   * });
   *
   * console.log(summary.total.total_cost_usd);
   * for (const model of summary.models) {
   *   console.log(model.model, model.total_num_requests);
   * }
   * ```
   */
  async getSummary(options: GetUsageSummaryOptions): Promise<UsageSummaryResponse> {
    const { start_time, end_time, signal } = options;

    const response = await this.http.request<UsageSummaryResponse>({
      method: 'GET',
      path: '/v1/usage/summary',
      query: {
        start_time,
        end_time,
      },
      ...(signal && { signal }),
    });

    return response.data;
  }
}
