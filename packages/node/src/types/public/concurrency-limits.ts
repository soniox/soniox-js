/**
 * Live concurrency counts.
 */
export type ConcurrencyCurrentValues = {
  /**
   * Current number of concurrent transcription sessions.
   */
  transcribe_concurrent: number;

  /**
   * Current number of concurrent TTS sessions.
   */
  tts_concurrent: number;
};

/**
 * Configured concurrency limits.
 */
export type ConcurrencyLimitValues = {
  /**
   * Configured transcription concurrency limit. Null means no configured limit.
   */
  transcribe_concurrent: number | null;

  /**
   * Configured TTS concurrency limit. Null means no configured limit.
   */
  tts_concurrent: number | null;
};

/**
 * Current counts and configured limits for a concurrency scope.
 */
export type ConcurrencyScopeValues = {
  /**
   * Current live concurrency counts.
   */
  current: ConcurrencyCurrentValues;

  /**
   * Configured concurrency limits.
   */
  limits: ConcurrencyLimitValues;
};

/**
 * Current concurrent counts plus configured concurrency limits for the project
 * and its organization. Values are region-scoped.
 */
export type ConcurrencyLimitsResponse = {
  /**
   * Project-level concurrency counts and limits.
   */
  project: ConcurrencyScopeValues;

  /**
   * Organization-level concurrency counts and limits.
   */
  organization: ConcurrencyScopeValues;
};

/**
 * Stream kind for concurrent streams history.
 *
 * - `stt`: Speech-to-Text WebSocket sessions
 * - `tts`: Text-to-Speech WebSocket streams and REST requests
 */
export type ConcurrentStreamKind = 'stt' | 'tts';

/**
 * Aggregation period for concurrent streams history, in seconds.
 *
 * - `60`: per-minute
 * - `3600`: hourly
 * - `86400`: daily
 */
export type ConcurrentStreamsHistoryPeriodSec = 60 | 3600 | 86400;

/**
 * Options for retrieving concurrent streams history.
 */
export type GetConcurrentStreamsHistoryOptions = {
  /**
   * Start of the time window (inclusive). Must be an ISO 8601 timestamp in UTC.
   * Filters by `period_start`.
   *
   * @example '2026-04-28T09:00:00Z'
   */
  start_time: string;

  /**
   * End of the time window (exclusive). Must be an ISO 8601 timestamp in UTC and
   * strictly after `start_time`. Filters by `period_start`.
   *
   * @example '2026-04-28T10:00:00Z'
   */
  end_time: string;

  /**
   * Aggregation period in seconds. Also caps how long the requested window may
   * be: for `period_sec=60` the window must not exceed 7 days. A window longer
   * than the cap for its period, or one that would return more than 20000
   * entries, is rejected with a `400 invalid_request` error.
   */
  period_sec: ConcurrentStreamsHistoryPeriodSec;

  /**
   * Stream kind to return.
   */
  kind: ConcurrentStreamKind;

  /**
   * AbortSignal for cancelling the request.
   */
  signal?: AbortSignal | undefined;
};

/**
 * Per-period concurrent stream aggregate for the authenticated project.
 */
export type ConcurrentStreamsHistoryEntry = {
  /**
   * Start of the aggregation period, UTC. Aligned to a multiple of `period_sec`.
   *
   * @format date-time
   */
  period_start: string;

  /**
   * Aggregation period in seconds.
   */
  period_sec: number;

  /**
   * Lowest recorded concurrent stream count in the period.
   * Always `0`, at every tier, because that is what the per-minute tier records.
   * Use `sample_max` for the peak.
   */
  sample_min: number;

  /**
   * Peak concurrent stream count in the period.
   * Stays exact when periods are rolled up into hours and days.
   * `0` when the period had no activity.
   */
  sample_max: number;

  /**
   * Sum of the recorded concurrency values in the period.
   * Divide by `sample_count` for the average while streams were active, or by
   * `total_count` for the average across the whole period (idle slots as zero).
   */
  sample_sum: number;

  /**
   * Number of values actually recorded in the period.
   * For `period_sec=60` this is how many samples were taken during that minute,
   * so it is usually larger than `total_count`. For hourly and daily periods it
   * is the number of source periods that had data, at most `total_count`.
   * `0` when the period had no activity.
   */
  sample_count: number;

  /**
   * Number of slots the period covers.
   * `1` for `period_sec=60`, `60` for `3600` (minutes per hour), `24` for
   * `86400` (hours per day).
   * `0` when the period had no activity.
   */
  total_count: number;
};

/**
 * Concurrent streams history for the authenticated project.
 */
export type ConcurrentStreamsHistoryResponse = {
  /**
   * Stream kind these entries describe (`stt` or `tts`).
   */
  kind: ConcurrentStreamKind;

  /**
   * Per-period aggregates ordered by `period_start` ascending.
   * Every aggregation period in the requested window is returned, with no gaps.
   * Periods with no recorded activity have every numeric field set to `0`.
   */
  entries: ConcurrentStreamsHistoryEntry[];
};
