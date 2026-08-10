/**
 * Transcription mode of the model.
 */
export type SonioxTranscriptionMode = 'real_time' | 'async';

export type SonioxLanguage = {
  /**
   * 2-letter language code.
   */
  code: string;
  /**
   * Language name.
   */
  name: string;
};

export type SonioxTranslationTarget = {
  target_language: string;
  source_languages: string[];
  exclude_source_languages: string[];
};

export type SonioxModel = {
  /**
   * Unique identifier of the model.
   */
  id: string;
  /**
   * If this is an alias, the id of the aliased model. Null for non-alias models.
   */
  aliased_model_id: string | null;
  /**
   * Name of the model.
   */
  name: string;
  /**
   * Version of context supported.
   */
  context_version: number | null;
  /**
   * Transcription mode of the model.
   */
  transcription_mode: SonioxTranscriptionMode;
  /**
   * List of languages supported by the model.
   */
  languages: SonioxLanguage[];

  /**
   * Whether the model supports `language_hints_strict`.
   */
  supports_language_hints_strict: boolean;

  /**
   * Whether the model supports `max_endpoint_delay_ms` on real-time sessions.
   */
  supports_max_endpoint_delay: boolean;

  /**
   * Whether the model supports endpoint sensitivity configuration.
   */
  supports_endpoint_sensitivity: boolean;

  /**
   * Whether the model supports `endpoint_latency_adjustment_level` on
   * real-time sessions.
   */
  supports_endpoint_latency_adjustment: boolean;

  /**
   * Maximum `endpoint_latency_adjustment_level` the model accepts.
   * Valid levels are `0` (no adjustment) through this value; `0` means the
   * feature is unsupported.
   */
  endpoint_latency_adjustment_max_level: number;

  /**
   * List of supported one-way translation targets. If list is empty, check for one_way_translation field
   */
  translation_targets: SonioxTranslationTarget[];

  /**
   * List of supported two-way translation pairs. If list is empty, check for two_way_translation field
   */
  two_way_translation_pairs: string[];

  /**
   * When contains string 'all_languages', any laguage from languages can be used
   */
  one_way_translation: string | null;

  /**
   * When contains string 'all_languages',' any laguage pair from languages can be used
   */
  two_way_translation: string | null;
};
