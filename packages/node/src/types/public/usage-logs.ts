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

/**
 * Options for retrieving an aggregated usage summary.
 *
 * Usage is aggregated by whole UTC day over the half-open window
 * `[start_time, end_time)`: a day is included when the window covers any part
 * of it. The window must not cover more than 366 UTC days.
 */
export type GetUsageSummaryOptions = {
  /**
   * Start of the window (inclusive). Must be an ISO 8601 timestamp in UTC.
   * Its UTC day is included.
   *
   * @example '2026-04-01T00:00:00Z'
   */
  start_time: string;

  /**
   * End of the window (exclusive). Must be an ISO 8601 timestamp in UTC and
   * strictly after `start_time`. Its UTC day is included unless it falls
   * exactly on midnight.
   *
   * @example '2026-04-03T00:00:00Z'
   */
  end_time: string;

  /**
   * AbortSignal for cancelling the request.
   */
  signal?: AbortSignal | undefined;
};

/**
 * Aggregated usage for a model (or the project total) over a time window.
 *
 * Per-day arrays are aligned to {@link UsageSummaryEntry.days}.
 */
export type UsageSummaryEntry = {
  /**
   * Model identifier. `null` on the {@link UsageSummaryResponse.total} entry.
   */
  model: string | null;

  /**
   * One UTC day (`YYYY-MM-DD`) per element, in ascending order. Every day in
   * the requested window is present, including days with no usage.
   *
   * @format date
   */
  days: string[];

  /**
   * Total cost over the window, in USD.
   * Equals `total_input_cost_usd` + `total_output_cost_usd` + `total_duration_cost_usd`.
   */
  total_cost_usd: string;

  /**
   * Total cost of input tokens over the window, in USD.
   */
  total_input_cost_usd: string;

  /**
   * Total cost of output tokens over the window, in USD.
   */
  total_output_cost_usd: string;

  /**
   * Total cost over the window for models billed by session duration rather
   * than by tokens, in USD. `0` for Speech-to-Text and Text-to-Speech models.
   */
  total_duration_cost_usd: string;

  /**
   * Cost per day, in USD, aligned to `days`.
   */
  cost_usd: string[];

  /**
   * Cost of input tokens per day, in USD, aligned to `days`.
   */
  input_cost_usd: string[];

  /**
   * Cost of output tokens per day, in USD, aligned to `days`.
   */
  output_cost_usd: string[];

  /**
   * Duration-billed cost per day, in USD, aligned to `days`.
   */
  duration_cost_usd: string[];

  /**
   * Number of requests over the window.
   */
  total_num_requests: number;

  total_input_text_tokens: number;
  total_input_audio_tokens: number;
  total_input_audio_duration_ms: number;
  total_output_text_tokens: number;
  total_output_audio_tokens: number;
  total_output_audio_duration_ms: number;

  /**
   * Billed session duration over the window, in milliseconds, for models
   * billed by duration. `0` for Speech-to-Text and Text-to-Speech models.
   */
  total_duration_ms: number;

  /**
   * Number of requests per day, aligned to `days`.
   */
  num_requests: number[];

  input_text_tokens: number[];
  input_audio_tokens: number[];
  input_audio_duration_ms: number[];
  output_text_tokens: number[];
  output_audio_tokens: number[];
  output_audio_duration_ms: number[];

  /**
   * Billed session duration per day, in milliseconds, aligned to `days`.
   */
  duration_ms: number[];
};

/**
 * Aggregated usage summary for the authenticated project.
 */
export type UsageSummaryResponse = {
  /**
   * Cost and activity across all models. Its `model` is `null`.
   */
  total: UsageSummaryEntry;

  /**
   * One entry per model that recorded usage in the window.
   * Empty when the project had no usage.
   */
  models: UsageSummaryEntry[];
};
