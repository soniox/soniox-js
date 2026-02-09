import type { HttpClient } from '../http/client.js';
import { isNotFoundError } from '../http/errors.js';
import type {
  FileIdentifier,
  ListFilesOptions,
  ListFilesResponse,
  PurgeFilesOptions,
  PurgeResult,
  SonioxFileData,
  UploadFileInput,
  UploadFileOptions,
} from '../types/public/index.js';

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
   * @throws {SonioxHttpError} On API errors (except 404)
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

/**
 * Default filename when none can be inferred
 */
const DEFAULT_FILENAME = 'file';

/**
 * Checks if the input is an async-iterable Node.js readable stream
 */
function isNodeReadableStream(input: unknown): input is NodeJS.ReadableStream {
  return (
    typeof input === 'object' &&
    input !== null &&
    'pipe' in input &&
    typeof (input as NodeJS.ReadableStream).pipe === 'function' &&
    Symbol.asyncIterator in input
  );
}

/**
 * Checks if the input is a Web ReadableStream
 */
function isWebReadableStream(input: unknown): input is ReadableStream<Uint8Array> {
  return (
    typeof input === 'object' &&
    input !== null &&
    'getReader' in input &&
    typeof (input as ReadableStream).getReader === 'function'
  );
}

/**
 * Collects chunks from a Node.js readable stream into a Buffer
 * Aborts early if size exceeds MAX_FILE_SIZE to prevent OOM
 */
async function collectNodeStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    if (typeof chunk === 'string') {
      throw new Error(
        'Stream returned string chunks. Use a binary stream (e.g., fs.createReadStream without encoding option).'
      );
    }

    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    totalLength += buf.length;
    if (totalLength > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`);
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

/**
 * Collects chunks from a Web ReadableStream into a Uint8Array
 * Aborts early if size exceeds MAX_FILE_SIZE to prevent OOM
 */
async function collectWebStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalLength += value.length;
      if (totalLength > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Resolves the file input to a Blob and filename
 */
async function resolveFileInput(
  input: UploadFileInput,
  filenameOverride?: string
): Promise<{ blob: Blob; filename: string }> {
  // Blob (includes File which has a name property)
  if (input instanceof Blob) {
    if (input.size > MAX_FILE_SIZE) {
      throw new Error(`File size (${input.size} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`);
    }

    const filename =
      filenameOverride ?? ('name' in input && typeof input.name === 'string' ? input.name : DEFAULT_FILENAME);

    return {
      blob: input,
      filename,
    };
  }

  // Buffer
  if (Buffer.isBuffer(input)) {
    if (input.length > MAX_FILE_SIZE) {
      throw new Error(`File size (${input.length} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`);
    }

    return {
      blob: new Blob([new Uint8Array(input)]),
      filename: filenameOverride ?? DEFAULT_FILENAME,
    };
  }

  // Uint8Array (but not Buffer)
  if (input instanceof Uint8Array) {
    if (input.length > MAX_FILE_SIZE) {
      throw new Error(`File size (${input.length} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`);
    }

    return {
      blob: new Blob([new Uint8Array(input)]),
      filename: filenameOverride ?? DEFAULT_FILENAME,
    };
  }

  // Web ReadableStream
  if (isWebReadableStream(input)) {
    const data = await collectWebStream(input);
    return {
      blob: new Blob([new Uint8Array(data)]),
      filename: filenameOverride ?? DEFAULT_FILENAME,
    };
  }

  // Node.js ReadableStream
  if (isNodeReadableStream(input)) {
    const buffer = await collectNodeStream(input);
    return {
      blob: new Blob([new Uint8Array(buffer)]),
      filename: filenameOverride ?? DEFAULT_FILENAME,
    };
  }

  throw new Error('Invalid file input. Expected Buffer, Uint8Array, Blob, or ReadableStream.');
}

export class SonioxFilesAPI {
  constructor(private http: HttpClient) {}

  /**
   * Uploads a file to Soniox for transcription
   *
   * @param file - Buffer, Uint8Array, Blob, or ReadableStream
   * @param options - Upload options
   * @returns The uploaded file metadata
   * @throws {SonioxHttpError} On API errors
   * @throws {Error} On validation errors (file too large, invalid input)
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
    const { blob, filename: resolvedFilename } = await resolveFileInput(file, filename);

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
   * @throws {SonioxHttpError}
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
   * Retrieve metadata for an uploaded file.
   *
   * @param file - The UUID of the file or a SonioxFile instance
   * @param signal - Optional AbortSignal for cancellation
   * @returns The file instance, or null if not found
   * @throws {SonioxHttpError} On API errors (except 404)
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
   * @throws {SonioxHttpError} On API errors (except 404)
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
   * @throws {SonioxHttpError} On API errors.
   * @throws {Error} If the operation is aborted via signal.
   *
   * @example
   * ```typescript
   * // Delete all files
   * const { deleted } = await client.files.purge();
   * console.log(`Deleted ${deleted} files.`);
   *
   * // With progress logging
   * const { deleted } = await client.files.purge({
   *     on_progress: (file, index) => {
   *         console.log(`Deleting file: ${file.id} (${index + 1})`);
   *     },
   * });
   *
   * // With cancellation
   * const controller = new AbortController();
   * const { deleted } = await client.files.purge({ signal: controller.signal });
   * ```
   */
  async purge(options: PurgeFilesOptions = {}): Promise<PurgeResult> {
    const { signal, on_progress } = options;
    const result = await this.list({ signal });
    let deleted = 0;

    for await (const file of result) {
      signal?.throwIfAborted();
      on_progress?.(file.toJSON(), deleted);
      await this.delete(file, signal);
      deleted++;
    }

    return { deleted };
  }
}
