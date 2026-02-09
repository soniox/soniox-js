/**
 * Raw file metadata from the API.
 */
export type SonioxFileData = {
  /**
   * Unique identifier of the file.
   * @format uuid
   */
  id: string;

  /**
   * Name of the file.
   */
  filename: string;

  /**
   * Size of the file in bytes.
   */
  size: number;

  /**
   * UTC timestamp indicating when the file was uploaded.
   * @format date-time
   */
  created_at: string;

  /**
   * Optional tracking identifier string.
   */
  client_reference_id?: string | null | undefined;
};

/**
 * Options for listing files.
 */
export type ListFilesOptions = {
  /**
   * Maximum number of files to return.
   * @default 1000
   * @minimum 1
   * @maximum 1000
   */
  limit?: number | undefined;

  /**
   * Pagination cursor for the next page of results.
   */
  cursor?: string | undefined;

  /**
   * AbortSignal for cancelling the request
   */
  signal?: AbortSignal | undefined;
};

/**
 * Response from listing files.
 */
export type ListFilesResponse<T> = {
  /**
   * List of uploaded files.
   */
  files: T[];

  /**
   * A pagination token that references the next page of results.
   * When null, no additional results are available.
   */
  next_page_cursor: string | null;
};

/**
 * File identifier - either a string ID or an object with an id property.
 */
export type FileIdentifier = string | { readonly id: string };

/**
 * Supported input types for file upload
 */
export type UploadFileInput = Buffer | Uint8Array | Blob | ReadableStream<Uint8Array> | NodeJS.ReadableStream;

/**
 * Options for uploading a file
 */
export type UploadFileOptions = {
  /**
   * Custom filename for the uploaded file
   */
  filename?: string | undefined;

  /**
   * Optional tracking identifier string. Does not need to be unique
   * @maxLength 256
   */
  client_reference_id?: string | undefined;

  /**
   * AbortSignal for cancelling the upload
   */
  signal?: AbortSignal | undefined;

  /**
   * Request timeout in milliseconds
   */
  timeout_ms?: number | undefined;
};

/**
 * Options for purging all files.
 */
export type PurgeFilesOptions = {
  /**
   * AbortSignal for cancelling the purge operation.
   */
  signal?: AbortSignal | undefined;

  /**
   * Callback invoked before each file is deleted.
   * Receives the file data and its 0-based index.
   */
  on_progress?: ((file: SonioxFileData, index: number) => void) | undefined;
};
