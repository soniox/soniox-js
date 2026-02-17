/**
 * Shared transcription types used by both @soniox/node and @soniox/client.
 */

/**
 * Key-value pair for general context information.
 */
export type ContextGeneralEntry = {
  /**
   * The key describing the context type (e.g., "domain", "topic", "doctor").
   */
  key: string;

  /**
   * The value for the context key.
   */
  value: string;
};

/**
 * Custom translation term mapping.
 */
export type ContextTranslationTerm = {
  /**
   * The source term to translate.
   */
  source: string;

  /**
   * The target translation for the term.
   */
  target: string;
};

/**
 * Additional context to improve transcription and translation accuracy.
 * All sections are optional - include only what's relevant for your use case.
 */
export type TranscriptionContext = {
  /**
   * Structured key-value pairs describing domain, topic, intent, participant names, etc.
   */
  general?: ContextGeneralEntry[] | undefined;

  /**
   * Longer free-form background text, prior interaction history, reference documents, or meeting notes.
   */
  text?: string | undefined;

  /**
   * Domain-specific or uncommon words to recognize.
   */
  terms?: string[] | undefined;

  /**
   * Custom translations for ambiguous terms.
   */
  translation_terms?: ContextTranslationTerm[] | undefined;
};

/**
 * One-way translation configuration.
 * Translates all spoken languages into a single target language.
 */
export type OneWayTranslationConfig = {
  /**
   * Translation type.
   */
  type: 'one_way';

  /**
   * Target language code for translation (e.g., "fr", "es", "de").
   */
  target_language: string;
};

/**
 * Two-way translation configuration.
 * Translates between two specified languages.
 */
export type TwoWayTranslationConfig = {
  /**
   * Translation type.
   */
  type: 'two_way';

  /**
   * First language code.
   */
  language_a: string;

  /**
   * Second language code.
   */
  language_b: string;
};

/**
 * Translation configuration.
 */
export type TranslationConfig = OneWayTranslationConfig | TwoWayTranslationConfig;

/**
 * Fields that can be used to group tokens into segments
 */
export type SegmentGroupKey = 'speaker' | 'language';
