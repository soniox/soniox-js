/**
 * Sort order for usage logs.
 */
export type UsageLogsSort = 'end_time_asc' | 'end_time_desc';

/**
 * Options for listing usage logs.
 */
export type ListUsageLogsOptions = {
  /**
   * Start of the time window (inclusive), filtering by request end time.
   * Must be an ISO 8601 timestamp in UTC.
   *
   * @example '2026-04-28T09:00:00Z'
   */
  start_time: string;

  /**
   * End of the time window (exclusive), filtering by request end time.
   * Must be an ISO 8601 timestamp in UTC.
   *
   * @example '2026-04-29T09:00:00Z'
   */
  end_time: string;

  /**
   * Maximum number of usage log entries to return.
   *
   * @default 1000
   * @minimum 1
   * @maximum 1000
   */
  limit?: number | undefined;

  /**
   * Sort order by end_time.
   *
   * @default 'end_time_asc'
   */
  sort?: UsageLogsSort | undefined;

  /**
   * Pagination cursor for the next page of results.
   */
  cursor?: string | undefined;

  /**
   * AbortSignal for cancelling the request.
   */
  signal?: AbortSignal | undefined;
};

/**
 * Per-request usage log entry.
 */
export type SonioxUsageLog = {
  /**
   * Unique identifier of the request.
   *
   * @format uuid
   */
  uuid: string;

  /**
   * Request scope.
   */
  request_scope: string;

  /**
   * Optional tracking identifier provided by the caller.
   */
  client_reference_id?: string | null | undefined;

  /**
   * Model used for the request.
   */
  model: string;

  /**
   * UTC timestamp indicating when the request started.
   *
   * @format date-time
   */
  start_time: string;

  /**
   * UTC timestamp indicating when the request ended.
   *
   * @format date-time
   */
  end_time: string;

  /**
   * Number of input text tokens.
   */
  input_text_tokens: number;

  /**
   * Number of input audio tokens.
   */
  input_audio_tokens: number;

  /**
   * Input audio duration in milliseconds.
   */
  input_audio_duration_ms: number;

  /**
   * Number of output text tokens.
   */
  output_text_tokens: number;

  /**
   * Number of output audio tokens.
   */
  output_audio_tokens: number;

  /**
   * Output audio duration in milliseconds.
   */
  output_audio_duration_ms: number;

  /**
   * Total request cost in USD, represented as a decimal string.
   */
  cost_usd: string;

  /**
   * Input cost in USD, represented as a decimal string.
   */
  input_cost_usd: string;

  /**
   * Input text cost in USD, represented as a decimal string.
   */
  input_text_cost_usd: string;

  /**
   * Input audio cost in USD, represented as a decimal string.
   */
  input_audio_cost_usd: string;

  /**
   * Output cost in USD, represented as a decimal string.
   */
  output_cost_usd: string;

  /**
   * Output text cost in USD, represented as a decimal string.
   */
  output_text_cost_usd: string;

  /**
   * Output audio cost in USD, represented as a decimal string.
   */
  output_audio_cost_usd: string;
};

/**
 * Response from listing usage logs.
 */
export type ListUsageLogsResponse = {
  /**
   * Per-request usage log entries ordered by end_time and UUID.
   */
  usage_logs: SonioxUsageLog[];

  /**
   * Pagination cursor for the next page of results. Null if no more pages.
   */
  next_page_cursor: string | null;
};
