/**
 * Shared helpers for resolving multipart upload inputs (used by the Files
 * and Voices APIs). Accepts a variety of binary inputs and resolves them to
 * a `Blob` plus a filename, enforcing a configurable maximum size.
 */

/**
 * Supported input types for binary uploads.
 */
export type UploadInput = Buffer | Uint8Array | Blob | ReadableStream<Uint8Array> | NodeJS.ReadableStream;

/**
 * Options for resolving an upload input.
 */
export interface ResolveUploadInputOptions {
  /**
   * Maximum allowed size in bytes. Inputs larger than this are rejected.
   */
  maxBytes: number;

  /**
   * Explicit filename to use, overriding any name inferred from the input.
   */
  filenameOverride?: string | undefined;

  /**
   * Filename to fall back to when none can be inferred.
   */
  defaultFilename?: string;
}

/**
 * Default filename when none can be inferred.
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
 * Aborts early if size exceeds maxBytes to prevent OOM
 */
async function collectNodeStream(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
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
    if (totalLength > maxBytes) {
      throw new Error(`File size exceeds maximum allowed size (${maxBytes} bytes)`);
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

/**
 * Collects chunks from a Web ReadableStream into a Uint8Array
 * Aborts early if size exceeds maxBytes to prevent OOM
 */
async function collectWebStream(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalLength += value.length;
      if (totalLength > maxBytes) {
        throw new Error(`File size exceeds maximum allowed size (${maxBytes} bytes)`);
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
 * Resolves a binary upload input to a Blob and filename, enforcing a maximum
 * size. Supports Buffer, Uint8Array, Blob (including File), Web ReadableStream,
 * and Node.js readable streams.
 */
export async function resolveUploadInput(
  input: UploadInput,
  options: ResolveUploadInputOptions
): Promise<{ blob: Blob; filename: string }> {
  const { maxBytes, filenameOverride, defaultFilename = DEFAULT_FILENAME } = options;

  // Blob (includes File which has a name property)
  if (input instanceof Blob) {
    if (input.size > maxBytes) {
      throw new Error(`File size (${input.size} bytes) exceeds maximum allowed size (${maxBytes} bytes)`);
    }

    const filename =
      filenameOverride ?? ('name' in input && typeof input.name === 'string' ? input.name : defaultFilename);

    return {
      blob: input,
      filename,
    };
  }

  // Buffer
  if (Buffer.isBuffer(input)) {
    if (input.length > maxBytes) {
      throw new Error(`File size (${input.length} bytes) exceeds maximum allowed size (${maxBytes} bytes)`);
    }

    return {
      blob: new Blob([new Uint8Array(input)]),
      filename: filenameOverride ?? defaultFilename,
    };
  }

  // Uint8Array (but not Buffer)
  if (input instanceof Uint8Array) {
    if (input.length > maxBytes) {
      throw new Error(`File size (${input.length} bytes) exceeds maximum allowed size (${maxBytes} bytes)`);
    }

    return {
      blob: new Blob([new Uint8Array(input)]),
      filename: filenameOverride ?? defaultFilename,
    };
  }

  // Web ReadableStream
  if (isWebReadableStream(input)) {
    const data = await collectWebStream(input, maxBytes);
    return {
      blob: new Blob([new Uint8Array(data)]),
      filename: filenameOverride ?? defaultFilename,
    };
  }

  // Node.js ReadableStream
  if (isNodeReadableStream(input)) {
    const buffer = await collectNodeStream(input, maxBytes);
    return {
      blob: new Blob([new Uint8Array(buffer)]),
      filename: filenameOverride ?? defaultFilename,
    };
  }

  throw new Error('Invalid file input. Expected Buffer, Uint8Array, Blob, or ReadableStream.');
}
