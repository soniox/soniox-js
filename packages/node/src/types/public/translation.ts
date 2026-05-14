import type { UploadFileInput } from './files.js';
import type {
  CleanupTarget,
  ISonioxTranscript,
  ISonioxTranscription,
  TranscriptionContext,
  TranscriptToken,
  WaitOptions,
} from './transcriptions.js';

/**
 * Shorthand specification of the translation direction(s) for
 * {@link SonioxSttApi.translate}.
 *
 * Three mutually exclusive shapes:
 *
 * - `{ to }` — one-way translation into `to`. Source language(s) are
 *   detected automatically.
 * - `{ to, from }` — one-way translation from `from` to `to`. The source
 *   language is hinted to the model.
 * - `{ between: [a, b] }` — two-way translation between `a` and `b`.
 *   Each side is translated into the other; speech in any third language
 *   is passed through as-is.
 */
export type TranslateMode =
  | { to: string; from?: never; between?: never }
  | { to: string; from: string; between?: never }
  | { between: [string, string]; to?: never; from?: never };

/**
 * Audio source for {@link SonioxSttApi.translate}. Exactly one of
 * `file`, `file_id`, or `audio_url` must be provided.
 */
export type TranslateAudioSource =
  | {
      /**
       * File data to upload and translate.
       */
      file: UploadFileInput;
      filename?: string | undefined;
      file_id?: never;
      audio_url?: never;
    }
  | {
      /**
       * ID of a previously uploaded file.
       * @format uuid
       */
      file_id: string;
      file?: never;
      filename?: never;
      audio_url?: never;
    }
  | {
      /**
       * URL of a publicly accessible audio file.
       * @maxLength 4096
       */
      audio_url: string;
      file?: never;
      filename?: never;
      file_id?: never;
    };

/**
 * Common (non-mode, non-source) options shared by every translate call.
 */
export type TranslateBaseOptions = {
  /**
   * Speech-to-text model to use.
   * @default 'stt-async-v4'
   * @maxLength 32
   */
  model?: string | undefined;

  /**
   * Enable speaker diarization to identify different speakers.
   */
  enable_speaker_diarization?: boolean | undefined;

  /**
   * Additional context to improve transcription and translation accuracy.
   */
  context?: TranscriptionContext | undefined;

  /**
   * URL to receive webhook notifications when translation is completed or fails.
   * @maxLength 256
   */
  webhook_url?: string | undefined;

  /**
   * Name of the authentication header sent with webhook notifications.
   * @maxLength 256
   */
  webhook_auth_header_name?: string | undefined;

  /**
   * Authentication header value sent with webhook notifications.
   * @maxLength 256
   */
  webhook_auth_header_value?: string | undefined;

  /**
   * Query parameters to append to the webhook URL.
   */
  webhook_query?: string | URLSearchParams | Record<string, string> | undefined;

  /**
   * Optional tracking identifier.
   * @maxLength 256
   */
  client_reference_id?: string | undefined;

  /**
   * Resources to clean up after translation completes or on error/timeout.
   */
  cleanup?: CleanupTarget[] | undefined;

  /**
   * When true, waits for translation to complete before returning.
   * @default false
   */
  wait?: boolean | undefined;

  /**
   * Options for waiting on completion.
   */
  wait_options?: WaitOptions | undefined;

  /**
   * When true (default), fetches and reshapes the translation result when
   * `wait=true` and the job completes successfully.
   * @default true
   */
  fetch_translation?: boolean | undefined;

  /**
   * AbortSignal to cancel the operation.
   */
  signal?: AbortSignal | undefined;

  /**
   * Timeout in milliseconds.
   */
  timeout_ms?: number | undefined;
};

/**
 * Options for {@link SonioxSttApi.translate}.
 *
 * Combines a {@link TranslateMode} (the translation direction shorthand),
 * a {@link TranslateAudioSource} (file, file_id, or audio_url), and
 * {@link TranslateBaseOptions}.
 */
export type TranslateOptions = TranslateMode & TranslateAudioSource & TranslateBaseOptions;

/**
 * A grouped pair of original speech and (optionally) its translation,
 * derived from the underlying transcript tokens.
 *
 * In one-way mode every segment that originated from speech in the source
 * language carries both `original_*` and `translation_*` fields. In two-way
 * mode the same is true for the two configured languages; speech in a third
 * language flows through with `translation_status: 'none'` and the
 * translation fields are omitted.
 */
export type TranslationSegment = {
  /**
   * Start time of the segment in milliseconds, taken from the first
   * original token. Absent when the segment has no original tokens.
   */
  start_ms?: number;

  /**
   * End time of the segment in milliseconds, taken from the last
   * original token. Absent when the segment has no original tokens.
   */
  end_ms?: number;

  /**
   * Speaker identifier (when speaker diarization is enabled).
   */
  speaker?: string;

  /**
   * Source language code.
   *
   * Derived from `original_tokens[0].language` when originals are present,
   * otherwise from `translation_tokens[0].source_language`.
   */
  from: string;

  /**
   * Concatenated text of `original_tokens`.
   */
  original_text: string;

  /**
   * Original tokens (`translation_status` of `'original'` or `'none'`)
   * for this segment, in order.
   */
  original_tokens: TranscriptToken[];

  /**
   * Target language code. Omitted when there are no translation tokens
   * (e.g. third-language pass-through under `between`).
   */
  to?: string;

  /**
   * Concatenated text of `translation_tokens`. Omitted when there are no
   * translation tokens.
   */
  translation_text?: string;

  /**
   * Translation tokens (`translation_status: 'translation'`) for this
   * segment, in order. Omitted when there are no translation tokens.
   */
  translation_tokens?: TranscriptToken[];
};

/**
 * Result of a one-way translation (`{ to }` or `{ to, from }` mode).
 *
 * `original_text` and `translation_text` flatten the per-segment content
 * across the whole audio, which is useful when the caller just wants two
 * parallel strings.
 */
export type OneWayTranslation = {
  mode: 'one_way';

  /**
   * Source language hint that was supplied via `from`. Undefined when only
   * `to` was provided and the source language was auto-detected.
   */
  from?: string;

  /**
   * Target language code (the `to` value passed in).
   */
  to: string;

  /**
   * Total audio duration in milliseconds. Equals the largest `end_ms`
   * across all original tokens, or `0` when there are no original tokens.
   */
  duration_ms: number;

  /**
   * Per-utterance segments in audio order.
   */
  segments: TranslationSegment[];

  /**
   * Concatenated text of every original token across all segments.
   */
  original_text: string;

  /**
   * Concatenated text of every translation token across all segments.
   */
  translation_text: string;
};

/**
 * Result of a two-way translation (`{ between }` mode).
 *
 * No flat `original_text` / `translation_text` strings are exposed because
 * which side is "original" depends on the segment. Read `segments` and
 * filter / format per `from` / `to` as needed.
 */
export type TwoWayTranslation = {
  mode: 'two_way';

  /**
   * First configured language (the `between[0]` value).
   */
  language_a: string;

  /**
   * Second configured language (the `between[1]` value).
   */
  language_b: string;

  /**
   * Total audio duration in milliseconds. Equals the largest `end_ms`
   * across all original tokens, or `0` when there are no original tokens.
   */
  duration_ms: number;

  /**
   * Per-utterance segments in audio order.
   */
  segments: TranslationSegment[];
};

/**
 * Discriminated translation result returned by
 * {@link SonioxTranslationJob.getTranslation},
 * {@link SonioxTranslationJob.fetchTranslation}, and
 * {@link translateFromTranscript}.
 */
export type SonioxTranslation = OneWayTranslation | TwoWayTranslation;

/**
 * Mode parameter accepted by {@link translateFromTranscript}.
 *
 * The async `translate()` method stores this internally on the returned job;
 * webhook handlers (and other callers that already have a transcript in hand)
 * supply it directly.
 */
export type TranslateFromTranscriptMode =
  | { type: 'one_way'; to: string; from?: string }
  | { type: 'two_way'; language_a: string; language_b: string };

/**
 * Type contract for SonioxTranslationJob class.
 */
export interface ISonioxTranslationJob extends ISonioxTranscription {
  readonly transcript: ISonioxTranscript | null | undefined;
  readonly translation: SonioxTranslation | null | undefined;
  toJSON(): ReturnType<ISonioxTranscription['toJSON']>;
  getTranslation(options?: { force?: boolean; signal?: AbortSignal }): Promise<SonioxTranslation | null>;
  fetchTranslation(options?: { force?: boolean; signal?: AbortSignal }): Promise<SonioxTranslation | null>;
  refresh(signal?: AbortSignal): Promise<ISonioxTranslationJob>;
  wait(options?: WaitOptions): Promise<ISonioxTranslationJob>;
}
