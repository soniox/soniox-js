import type { TranscriptionContext, TranslationConfig, SegmentGroupKey } from '@soniox/core';

import type { UploadFileInput } from './files.js';

// Re-export shared transcription types from @soniox/core
export type {
  ContextGeneralEntry,
  ContextTranslationTerm,
  TranscriptionContext,
  OneWayTranslationConfig,
  TwoWayTranslationConfig,
  TranslationConfig,
  SegmentGroupKey,
} from '@soniox/core';

/**
 * Status of a transcription request.
 */
export type TranscriptionStatus = 'queued' | 'processing' | 'completed' | 'error';

/**
 * Resource types that can be cleaned up after transcription completes.
 *
 * - `'file'` - The uploaded file
 * - `'transcription'` - The transcription record
 */
export type CleanupTarget = 'file' | 'transcription';

/**
 * Raw transcription metadata from the API.
 */
export type SonioxTranscriptionData = {
  /**
   * Unique identifier of the transcription.
   * @format uuid
   */
  id: string;

  /**
   * Current status of the transcription.
   */
  status: TranscriptionStatus;

  /**
   * UTC timestamp when the transcription was created.
   * @format date-time
   */
  created_at: string;

  /**
   * Speech-to-text model used.
   */
  model: string;

  /**
   * URL of the audio file being transcribed.
   */
  audio_url?: string | null | undefined;

  /**
   * ID of the uploaded file being transcribed.
   * @format uuid
   */
  file_id?: string | null | undefined;

  /**
   * Name of the file being transcribed.
   */
  filename: string;

  /**
   * Expected languages in the audio. If not specified, languages are automatically detected.
   */
  language_hints?: string[] | null | undefined;

  /**
   * When true, speakers are identified and separated in the transcription output.
   */
  enable_speaker_diarization: boolean;

  /**
   * When true, language is detected for each part of the transcription.
   */
  enable_language_identification: boolean;

  /**
   * Duration of the audio in milliseconds. Only available after processing begins.
   */
  audio_duration_ms?: number | null | undefined;

  /**
   * Error type if transcription failed. Null for successful or in-progress transcriptions.
   */
  error_type?: string | null | undefined;

  /**
   * Error message if transcription failed. Null for successful or in-progress transcriptions.
   */
  error_message?: string | null | undefined;

  /**
   * URL to receive webhook notifications when transcription is completed or fails.
   */
  webhook_url?: string | null | undefined;

  /**
   * Name of the authentication header sent with webhook notifications.
   */
  webhook_auth_header_name?: string | null | undefined;

  /**
   * Authentication header value. Always returned masked.
   */
  webhook_auth_header_value?: string | null | undefined;

  /**
   * HTTP status code received from your server when webhook was delivered. Null if not yet sent.
   */
  webhook_status_code?: number | null | undefined;

  /**
   * Optional tracking identifier.
   * @maxLength 256
   */
  client_reference_id?: string | null | undefined;

  /**
   * Additional context provided for the transcription.
   */
  context?: TranscriptionContext | null | undefined;
};

/**
 * Options for creating a transcription.
 */
export type CreateTranscriptionOptions = {
  /**
   * Speech-to-text model to use.
   * @maxLength 32
   */
  model: string;

  /**
   * URL of a publicly accessible audio file.
   * @maxLength 4096
   */
  audio_url?: string | undefined;

  /**
   * ID of a previously uploaded file.
   * @format uuid
   */
  file_id?: string | undefined;

  /**
   * Array of expected ISO language codes to bias recognition.
   */
  language_hints?: string[] | undefined;

  /**
   * When true, model relies more heavily on language hints.
   */
  language_hints_strict?: boolean | undefined;

  /**
   * Enable automatic language identification.
   */
  enable_language_identification?: boolean | undefined;

  /**
   * Enable speaker diarization to identify different speakers.
   */
  enable_speaker_diarization?: boolean | undefined;

  /**
   * Additional context to improve transcription accuracy and formatting of specialized terms.
   */
  context?: TranscriptionContext | undefined;

  /**
   * Translation configuration.
   */
  translation?: TranslationConfig | undefined;

  /**
   * URL to receive webhook notifications when transcription is completed or fails.
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
   * Optional tracking identifier.
   * @maxLength 256
   */
  client_reference_id?: string | undefined;
};

/**
 * Options for polling/waiting for transcription completion.
 */
export type WaitOptions = {
  /**
   * Polling interval in milliseconds.
   * @default 1000
   * @minimum 1000
   */
  interval_ms?: number | undefined;

  /**
   * Maximum time to wait in milliseconds.
   * @default 300000 (5 minutes)
   */
  timeout_ms?: number | undefined;

  /**
   * Callback invoked when status changes.
   */
  on_status_change?: ((status: TranscriptionStatus, transcription: SonioxTranscriptionData) => void) | undefined;

  /**
   * AbortSignal to cancel waiting.
   */
  signal?: AbortSignal | undefined;
};

/**
 * Base options shared by all audio source variants.
 */
export type TranscribeBaseOptions = {
  /**
   * Speech-to-text model to use.
   * @maxLength 32
   */
  model: string;

  /**
   * Array of expected ISO language codes to bias recognition.
   */
  language_hints?: string[] | undefined;

  /**
   * When true, model relies more heavily on language hints.
   */
  language_hints_strict?: boolean | undefined;

  /**
   * Enable automatic language identification.
   */
  enable_language_identification?: boolean | undefined;

  /**
   * Enable speaker diarization to identify different speakers.
   */
  enable_speaker_diarization?: boolean | undefined;

  /**
   * Additional context to improve transcription accuracy and formatting of specialized terms.
   */
  context?: TranscriptionContext | undefined;

  /**
   * Translation configuration.
   */
  translation?: TranslationConfig | undefined;

  /**
   * URL to receive webhook notifications when transcription is completed or fails.
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
   * Optional tracking identifier.
   * @maxLength 256
   */
  client_reference_id?: string | undefined;

  /**
   * When true, waits for transcription to complete before returning.
   * @default false
   */
  wait?: boolean | undefined;

  /**
   * Options for waiting (only used when wait=true).
   */
  wait_options?: WaitOptions | undefined;

  /**
   * When true (default), fetches the transcript and attaches it to the result
   * when wait=true and the transcription completes successfully.
   * Set to false to skip fetching the full transcript payload.
   * @default true
   */
  fetch_transcript?: boolean | undefined;

  /**
   * Query parameters to append to the webhook URL.
   * Useful for encoding metadata like transcription ID in the webhook callback.
   * Can be a string, URLSearchParams, or Record<string, string>.
   */
  webhook_query?: string | URLSearchParams | Record<string, string> | undefined;

  /**
   * AbortSignal to cancel the operation
   */
  signal?: AbortSignal | undefined;

  /**
   * Timeout in milliseconds
   */
  timeout_ms?: number | undefined;

  /**
   * Resources to clean up after transcription completes or on error/timeout.
   * Only applies when `wait: true`.
   *
   * Cleanup runs in all cases when `wait: true`:
   * - After successful completion
   * - After transcription errors (status: 'error')
   * - On timeout or abort
   *
   * This ensures no orphaned resources are left behind.
   *
   * @example
   * ```typescript
   * // Delete only the uploaded file
   * cleanup: ['file']
   *
   * // Delete only the transcription record
   * cleanup: ['transcription']
   *
   * // Delete both file and transcription
   * cleanup: ['file', 'transcription']
   * ```
   */
  cleanup?: CleanupTarget[] | undefined;
};

/**
 * Transcribe from a direct file upload (Buffer, Uint8Array, Blob, or ReadableStream)
 */
export type TranscribeFromFile = TranscribeBaseOptions & {
  /**
   * File data to upload and transcribe.
   */
  file: UploadFileInput;
  filename?: string | undefined;
  file_id?: never;
  audio_url?: never;
};

/**
 * Transcribe from a previously uploaded file
 */
export type TranscribeFromFileId = TranscribeBaseOptions & {
  /**
   * ID of a previously uploaded file.
   * @format uuid
   */
  file_id: string;
  file?: never;
  filename?: never;
  audio_url?: never;
};

/**
 * Transcribe from a publicly accessible audio URL
 */
export type TranscribeFromUrl = TranscribeBaseOptions & {
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
 * Options for the unified transcribe method
 * Exactly one audio source must be provided: `file`, `file_id`, or `audio_url`
 */
export type TranscribeOptions = TranscribeFromFile | TranscribeFromFileId | TranscribeFromUrl;

/**
 * Options for transcribing from a URL via `transcribeFromUrl`.
 */
export type TranscribeFromUrlOptions = Omit<TranscribeFromUrl, 'audio_url'>;

/**
 * Options for transcribing from a file via `transcribeFromFile`.
 */
export type TranscribeFromFileOptions = Omit<TranscribeFromFile, 'file'>;

/**
 * Options for transcribing from an uploaded file ID via `transcribeFromFileId`.
 */
export type TranscribeFromFileIdOptions = Omit<TranscribeFromFileId, 'file_id'>;

/**
 * Options for listing transcriptions
 */
export type ListTranscriptionsOptions = {
  /**
   * Maximum number of transcriptions to return.
   * @default 1000
   * @minimum 1
   * @maximum 1000
   */
  limit?: number | undefined;

  /**
   * Pagination cursor for the next page of results
   */
  cursor?: string | undefined;
};

/**
 * Response from listing transcriptions.
 */
export type ListTranscriptionsResponse<T> = {
  /**
   * List of transcriptions.
   */
  transcriptions: T[];

  /**
   * A pagination token that references the next page of results.
   * When null, no additional results are available.
   * TODO: potentially can be undefined?
   */
  next_page_cursor: string | null;
};

/**
 * Transcription identifier - either a string ID or an object with an id property.
 */
export type TranscriptionIdentifier = string | { readonly id: string };

/**
 * A single token from the transcript with timing and confidence information.
 */
export type TranscriptToken = {
  /**
   * The text content of this token.
   */
  text: string;

  /**
   * Start time of the token in milliseconds.
   */
  start_ms: number;

  /**
   * End time of the token in milliseconds.
   */
  end_ms: number;

  /**
   * Confidence score for this token (0.0 to 1.0).
   */
  confidence: number;

  /**
   * Speaker identifier (if speaker diarization was enabled).
   */
  speaker?: string | null | undefined;

  /**
   * Detected language code (if language identification was enabled).
   */
  language?: string | null | undefined;

  /**
   * Translation status for this token.
   */
  translation_status?: 'none' | 'original' | 'translation' | null | undefined;

  /**
   * Whether this token represents an audio event.
   */
  is_audio_event?: boolean | null | undefined;
};

/**
 * Response from getting a transcription transcript.
 */
export type TranscriptResponse = {
  /**
   * Unique identifier of the transcription this transcript belongs to.
   * @format uuid
   */
  id: string;

  /**
   * Complete transcribed text content.
   */
  text: string;

  /**
   * List of detailed token information with timestamps and metadata.
   */
  tokens: TranscriptToken[];
};

/**
 * Options for segmenting a transcript
 */
export type SegmentTranscriptOptions = {
  /**
   * Fields to group by. A new segment starts when any of these fields changes
   * @default ['speaker', 'language']
   */
  group_by?: SegmentGroupKey[] | undefined;
};

/**
 * A segment of contiguous tokens grouped by speaker and language
 */
export type TranscriptSegment = {
  /**
   * Concatenated text of all tokens in this segment.
   */
  text: string;

  /**
   * Start time of the segment in milliseconds (from first token).
   */
  start_ms: number;

  /**
   * End time of the segment in milliseconds (from last token).
   */
  end_ms: number;

  /**
   * Speaker identifier (if speaker diarization was enabled).
   */
  speaker?: string | undefined;

  /**
   * Detected language code (if language identification was enabled).
   */
  language?: string | undefined;

  /**
   * Original tokens in this segment.
   */
  tokens: TranscriptToken[];
};

/**
 * Options for deleting all transcriptions.
 */
export type DeleteAllTranscriptionsOptions = {
  /**
   * AbortSignal for cancelling the delete_all operation.
   */
  signal?: AbortSignal | undefined;

  /**
   * Callback invoked before each transcription is deleted.
   * Receives the transcription data and its 0-based index.
   */
  on_progress?: ((transcription: SonioxTranscriptionData, index: number) => void) | undefined;
};

/**
 * Type contract for SonioxTranscript class.
 * @see SonioxTranscript for full documentation.
 */
export interface ISonioxTranscript {
  readonly id: string;
  readonly text: string;
  readonly tokens: TranscriptToken[];
  segments(options?: SegmentTranscriptOptions): TranscriptSegment[];
}

/**
 * Type contract for SonioxTranscription class.
 * @see SonioxTranscription for full documentation.
 */
export interface ISonioxTranscription {
  readonly id: string;
  readonly status: TranscriptionStatus;
  readonly created_at: string;
  readonly model: string;
  readonly audio_url: string | null | undefined;
  readonly file_id: string | null | undefined;
  readonly filename: string;
  readonly language_hints: string[] | undefined;
  readonly enable_speaker_diarization: boolean;
  readonly enable_language_identification: boolean;
  readonly audio_duration_ms: number | null | undefined;
  readonly error_type: string | null | undefined;
  readonly error_message: string | null | undefined;
  readonly webhook_url: string | null | undefined;
  readonly webhook_auth_header_name: string | null | undefined;
  readonly webhook_auth_header_value: string | null | undefined;
  readonly webhook_status_code: number | null | undefined;
  readonly client_reference_id: string | null | undefined;
  readonly context: TranscriptionContext | null | undefined;
  readonly transcript: ISonioxTranscript | null | undefined;
  toJSON(): SonioxTranscriptionData;
  delete(): Promise<void>;
  destroy(): Promise<void>;
  getTranscript(options?: { force?: boolean; signal?: AbortSignal }): Promise<ISonioxTranscript | null>;
  refresh(signal?: AbortSignal): Promise<ISonioxTranscription>;
  wait(options?: WaitOptions): Promise<ISonioxTranscription>;
}
