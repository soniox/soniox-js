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
