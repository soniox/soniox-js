import type { UploadFileInput } from './files.js';

/**
 * Processing status of a voice for a specific model.
 *
 * - `not_computed`: Not prepared for this model yet (e.g. the model was
 *   released after the voice was created). Call recompute to prepare it.
 * - `processing`: Still being processed for this model. Wait and check again.
 * - `ready`: Usable with this model.
 * - `failed`: Processing failed permanently for this model. Fix the reference
 *   clip and create a new voice.
 */
export type VoiceModelStatus = 'not_computed' | 'processing' | 'ready' | 'failed';

/**
 * Voice status for a single model.
 */
export type VoiceModelStatusEntry = {
  /**
   * Name of the model.
   */
  model: string;

  /**
   * Has to be `ready` for the voice to be usable with this model.
   */
  status: VoiceModelStatus;

  /**
   * Machine-readable error category when status is `failed`. Stable across
   * releases — safe to use in control flow. `null` otherwise.
   */
  error_type?: string | null | undefined;

  /**
   * Human-readable error message when status is `failed` (e.g. the reference
   * audio is too long). `null` otherwise.
   */
  error_message?: string | null | undefined;
};

/**
 * Raw voice metadata from the API.
 */
export type SonioxVoiceData = {
  /**
   * Unique identifier of the voice.
   * @format uuid
   */
  id: string;

  /**
   * Name of the voice.
   */
  name: string;

  /**
   * Original file name of the uploaded audio clip.
   */
  filename: string;

  /**
   * UTC timestamp indicating when the voice was created.
   * @format date-time
   */
  created_at: string;

  /**
   * Voice status for each available model. A model with status `not_computed`
   * is not prepared yet (e.g. it was released after the voice was created);
   * call recompute to prepare the voice for it.
   */
  models: VoiceModelStatusEntry[];
};

/**
 * Voice identifier - either a string ID or an object with an id property.
 */
export type VoiceIdentifier = string | { readonly id: string };

/**
 * Supported input types for the reference audio clip.
 */
export type CreateVoiceInput = UploadFileInput;

/**
 * Options for creating a voice.
 */
export type CreateVoiceOptions = {
  /**
   * A name for the voice, unique within your project.
   * @minLength 1
   * @maxLength 128
   */
  name: string;

  /**
   * The reference audio clip for the voice. Keep it short (up to 20 seconds)
   * and within 10 MB.
   */
  file: CreateVoiceInput;

  /**
   * Custom filename for the uploaded reference clip.
   */
  filename?: string | undefined;

  /**
   * AbortSignal for cancelling the request.
   */
  signal?: AbortSignal | undefined;

  /**
   * Request timeout in milliseconds.
   */
  timeout_ms?: number | undefined;
};

/**
 * Options for listing voices.
 */
export type ListVoicesOptions = {
  /**
   * Maximum number of voices to return.
   */
  limit?: number | undefined;

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
 * Response from listing voices.
 */
export type ListVoicesResponse<T> = {
  /**
   * List of voices.
   */
  voices: T[];

  /**
   * A pagination token that references the next page of results.
   * When null, no additional results are available.
   */
  next_page_cursor: string | null;
};

/**
 * Total number of voices in your project.
 */
export type VoicesCountResponse = {
  /**
   * Total number of voices in your project.
   */
  total: number;
};

/**
 * Options for recomputing a voice.
 */
export type RecomputeVoiceOptions = {
  /**
   * The model to prepare this voice for. If omitted, the voice is prepared
   * for every available model it is not ready for yet.
   */
  model?: string | null | undefined;

  /**
   * AbortSignal for cancelling the request.
   */
  signal?: AbortSignal | undefined;
};

/**
 * Options for deleting all voices.
 */
export type DeleteAllVoicesOptions = {
  /**
   * AbortSignal for cancelling the delete_all operation.
   */
  signal?: AbortSignal | undefined;
};
