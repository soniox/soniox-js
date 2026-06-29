import type { HttpClient } from '../http/client.js';
import { isNotFoundError } from '../http/errors.js';
import type {
  FileIdentifier,
  FilesCountResponse,
  ListFilesOptions,
  ListFilesResponse,
  DeleteAllFilesOptions,
  SonioxFileData,
  UploadFileInput,
  UploadFileOptions,
} from '../types/public/index.js';

import { resolveUploadInput } from './upload-input.js';

/**
 * Uploaded file
 */
export class SonioxFile {
  readonly id: string;
  readonly filename: string;
  readonly size: number;
  readonly created_at: string;
  readonly client_reference_id: string | undefined;

  constructor(
    data: SonioxFileData,
    private readonly _http: HttpClient
  ) {
    this.id = data.id;
    this.filename = data.filename;
    this.size = data.size;
    this.created_at = data.created_at;

    if (data.client_reference_id) {
      if (data.client_reference_id.length > 256) {
        throw new Error('client_reference_id exceeds maximum length of 256 characters');
      }

      this.client_reference_id = data.client_reference_id;
    }
  }

  /**
   * Returns the raw data for this file.
   */
  toJSON(): SonioxFileData {
    return {
      id: this.id,
      filename: this.filename,
      size: this.size,
      created_at: this.created_at,
      client_reference_id: this.client_reference_id,
    };
  }

  /**
   * Permanently deletes this file.
   * This operation is idempotent - succeeds even if the file doesn't exist.
   *
   * @param signal - Optional AbortSignal for cancellation
   * @throws {@link SonioxHttpError} On API errors (except 404)
   *
   * @example
   * ```typescript
   * const file = await client.files.get('550e8400-e29b-41d4-a716-446655440000');
   * if (file) {
   *     await file.delete();
   * }
   * ```
   */
  async delete(signal?: AbortSignal): Promise<void> {
    try {
      await this._http.request<null>({
        method: 'DELETE',
        path: `/v1/files/${this.id}`,
        ...(signal && { signal }),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }
}

/**
 * Result set for file listing
 */
export class FileListResult implements AsyncIterable<SonioxFile> {
  /**
   * Files from the first page of results
   */
  readonly files: SonioxFile[];

  /**
   * Pagination cursor for the next page. Null if no more pages
   */
  readonly next_page_cursor: string | null;

  constructor(
    initialResponse: ListFilesResponse<SonioxFileData>,
    private readonly _http: HttpClient,
    private readonly _limit: number | undefined,
    private readonly _signal: AbortSignal | undefined = undefined
  ) {
    this.files = initialResponse.files.map((data) => new SonioxFile(data, _http));
    this.next_page_cursor = initialResponse.next_page_cursor;
  }

  /**
   * Returns the raw data for this list result.
   * Also used by JSON.stringify() to prevent serialization of internal HTTP client.
   */
  toJSON(): ListFilesResponse<SonioxFileData> {
    return {
      files: this.files.map((f) => f.toJSON()),
      next_page_cursor: this.next_page_cursor,
    };
  }

  /**
   * Returns true if there are more pages of results beyond the first page
   */
  isPaged(): boolean {
    return this.next_page_cursor !== null;
  }

  /**
   * Async iterator that automatically fetches all pages
   * Use with `for await...of` to iterate through all files
   */
  async *[Symbol.asyncIterator](): AsyncIterator<SonioxFile> {
    // Yield files from the first page
    for (const file of this.files) {
      yield file;
    }

    // Fetch and yield subsequent pages
    let cursor = this.next_page_cursor;
    while (cursor !== null) {
      const response = await this._http.request<ListFilesResponse<SonioxFileData>>({
        method: 'GET',
        path: '/v1/files',
        query: {
          limit: this._limit,
          cursor,
        },
        ...(this._signal && { signal: this._signal }),
      });

      for (const data of response.data.files) {
        yield new SonioxFile(data, this._http);
      }

      cursor = response.data.next_page_cursor;
    }
  }
}

/**
 * Helper to extract file ID from a FileIdentifier
 */
function getFileId(file: FileIdentifier): string {
  return typeof file === 'string' ? file : file.id;
}

/**
 * Maximum file size allowed by the API (1 GB)
 */
const MAX_FILE_SIZE = 1073741824;

export class SonioxFilesAPI {
  constructor(private http: HttpClient) {}

  /**
   * Uploads a file to Soniox for transcription
   *
   * @param file - Buffer, Uint8Array, Blob, or ReadableStream
   * @param options - Upload options
   * @returns The uploaded file metadata
   * @throws {@link SonioxHttpError} On API errors
   * @throws `Error` On validation errors (file too large, invalid input)
   *
   * @example Upload from file path (Node.js)
   * ```typescript
   * import * as fs from 'node:fs';
   *
   * const buffer = await fs.promises.readFile('/path/to/audio.mp3');
   * const file = await client.files.upload(buffer, { filename: 'audio.mp3' });
   * ```
   *
   * @example Upload from file path (Bun)
   * ```typescript
   * const file = await client.files.upload(Bun.file('/path/to/audio.mp3'));
   * ```
   *
   * @example Upload with tracking ID
   * ```typescript
   * const file = await client.files.upload(buffer, {
   *     filename: 'audio.mp3',
   *     client_reference_id: 'order-12345',
   * });
   * ```
   *
   * @example Upload with cancellation
   * ```typescript
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 30000);
   *
   * const file = await client.files.upload(buffer, {
   *     filename: 'audio.mp3',
   *     signal: controller.signal,
   * });
   * ```
   */
  async upload(file: UploadFileInput, options: UploadFileOptions = {}): Promise<SonioxFile> {
    const { filename, client_reference_id, signal, timeout_ms } = options;

    // Validate client_reference_id length
    if (client_reference_id !== undefined && client_reference_id.length > 256) {
      throw new Error(
        `client_reference_id exceeds maximum length of 256 characters (got ${client_reference_id.length})`
      );
    }

    // Resolve the file input to a Blob and filename
    const { blob, filename: resolvedFilename } = await resolveUploadInput(file, {
      maxBytes: MAX_FILE_SIZE,
      filenameOverride: filename,
    });

    // Build the FormData
    const formData = new FormData();
    formData.append('file', blob, resolvedFilename);

    if (client_reference_id !== undefined) {
      formData.append('client_reference_id', client_reference_id);
    }

    // Build request options
    const requestOptions: Parameters<HttpClient['request']>[0] = {
      method: 'POST',
      path: '/v1/files',
      body: formData,
    };

    if (signal !== undefined) {
      requestOptions.signal = signal;
    }

    if (timeout_ms !== undefined) {
      requestOptions.timeoutMs = timeout_ms;
    }

    // Make the request
    const response = await this.http.request<SonioxFileData>(requestOptions);

    return new SonioxFile(response.data, this.http);
  }

  /**
   * Retrieves list of uploaded files
   *
   * The returned result is async iterable - use `for await...of`
   *
   * @param options - Optional pagination and cancellation parameters
   * @returns FileListResult
   * @throws {@link SonioxHttpError}
   *
   * @example
   * ```typescript
   * const result = await client.files.list();
   *
   * // Automatic paging - iterates through ALL files across all pages
   * for await (const file of result) {
   *     console.log(file.filename, file.size);
   * }
   *
   * // Or access just the first page
   * for (const file of result.files) {
   *     console.log(file.filename);
   * }
   *
   * // Check if there are more pages
   * if (result.isPaged()) {
   *     console.log('More pages available');
   * }
   *
   * // Manual paging using cursor
   * const page1 = await client.files.list({ limit: 10 });
   * if (page1.next_page_cursor) {
   *     const page2 = await client.files.list({ cursor: page1.next_page_cursor });
   * }
   *
   * // With cancellation
   * const controller = new AbortController();
   * const result = await client.files.list({ signal: controller.signal });
   * ```
   */
  async list(options: ListFilesOptions = {}): Promise<FileListResult> {
    const { limit, cursor, signal } = options;

    const response = await this.http.request<ListFilesResponse<SonioxFileData>>({
      method: 'GET',
      path: '/v1/files',
      query: {
        limit,
        cursor,
      },
      ...(signal && { signal }),
    });

    return new FileListResult(response.data, this.http, limit, signal);
  }

  /**
   * Returns the total number of files, split by source.
   *
   * @param options - Optional cancellation parameters.
   * @returns Total file counts for Playground, Public API, and all sources.
   * @throws {@link SonioxHttpError} On API errors.
   *
   * @example
   * ```typescript
   * const counts = await client.files.count();
   * console.log(counts.total);
   * ```
   */
  async count(options: { signal?: AbortSignal } = {}): Promise<FilesCountResponse> {
    const { signal } = options;

    const response = await this.http.request<FilesCountResponse>({
      method: 'GET',
      path: '/v1/files/count',
      ...(signal && { signal }),
    });

    return response.data;
  }

  /**
   * Retrieve metadata for an uploaded file.
   *
   * @param file - The UUID of the file or a SonioxFile instance
   * @param signal - Optional AbortSignal for cancellation
   * @returns The file instance, or null if not found
   * @throws {@link SonioxHttpError} On API errors (except 404)
   *
   * @example
   * ```typescript
   * const file = await client.files.get('550e8400-e29b-41d4-a716-446655440000');
   * if (file) {
   *     console.log(file.filename, file.size);
   * }
   * ```
   */
  async get(file: FileIdentifier, signal?: AbortSignal): Promise<SonioxFile | null> {
    const file_id = getFileId(file);
    try {
      const response = await this.http.request<SonioxFileData>({
        method: 'GET',
        path: `/v1/files/${file_id}`,
        ...(signal && { signal }),
      });
      return new SonioxFile(response.data, this.http);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Permanently deletes a file.
   * This operation is idempotent - succeeds even if the file doesn't exist.
   *
   * @param file - The UUID of the file or a SonioxFile instance
   * @param signal - Optional AbortSignal for cancellation
   * @throws {@link SonioxHttpError} On API errors (except 404)
   *
   * @example
   * ```typescript
   * // Delete by ID
   * await client.files.delete('550e8400-e29b-41d4-a716-446655440000');
   *
   * // Or delete a file instance
   * const file = await client.files.get('550e8400-e29b-41d4-a716-446655440000');
   * if (file) {
   *     await client.files.delete(file);
   * }
   *
   * // Or just use the instance method
   * await file.delete();
   * ```
   */
  async delete(file: FileIdentifier, signal?: AbortSignal): Promise<void> {
    const file_id = getFileId(file);
    try {
      await this.http.request<null>({
        method: 'DELETE',
        path: `/v1/files/${file_id}`,
        ...(signal && { signal }),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Permanently deletes all uploaded files.
   * Iterates through all pages of files and deletes each one.
   *
   * @param options - Optional signal and progress callback.
   * @returns The number of files deleted.
   * @throws {@link SonioxHttpError} On API errors.
   * @throws `Error` If the operation is aborted via signal.
   *
   * @example
   * ```typescript
   * // Delete all files
   * await client.files.delete_all();
   * console.log(`Deleted all files.`);

   * // With cancellation
   * const controller = new AbortController();
   * await client.files.delete_all({ signal: controller.signal });
   * ```
   */
  async delete_all(options: DeleteAllFilesOptions = {}): Promise<void> {
    const { signal } = options;
    const result = await this.list({ signal });

    for await (const file of result) {
      signal?.throwIfAborted();
      await this.delete(file, signal);
    }
  }
}
