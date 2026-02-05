/**
 * HTTP error handling for the Soniox SDK
 */

import type { HttpErrorCode, HttpErrorDetails, HttpMethod } from '../types/public/http.js';

/** Maximum body text length to include in error details (4KB) */
const MAX_BODY_TEXT_LENGTH = 4096;

/**
 * Base error class for all Soniox SDK errors
 */
export class SonioxError extends Error {
  readonly code: string;

  constructor(message: string, code = 'SONIOX_ERROR') {
    super(message);
    this.name = 'SonioxError';
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * HTTP error class for all HTTP-related failures
 */
export class SonioxHttpError extends SonioxError {
  /** Categorized error code */
  declare readonly code: HttpErrorCode;
  /** Request URL */
  readonly url: string;
  /** HTTP method */
  readonly method: HttpMethod;
  /** HTTP status code (only for http_error) */
  readonly status: number | undefined;
  /** Response headers (only for http_error) */
  readonly headers: Record<string, string> | undefined;
  /** Response body text, capped at 4KB (only for http_error/parse_error) */
  readonly bodyText: string | undefined;
  /** Original error that caused this error */
  readonly cause: unknown;

  constructor(details: HttpErrorDetails) {
    super(details.message, details.code);
    this.name = 'SonioxHttpError';
    this.url = details.url;
    this.method = details.method;
    this.status = details.status;
    this.headers = details.headers;
    this.bodyText = details.bodyText;
    this.cause = details.cause;
  }

  /**
   * Creates a human-readable string representation
   */
  override toString(): string {
    const parts = [`SonioxHttpError [${this.code}]: ${this.message}`];
    parts.push(`  Method: ${this.method}`);
    parts.push(`  URL: ${this.url}`);
    if (this.status !== undefined) {
      parts.push(`  Status: ${this.status}`);
    }
    return parts.join('\n');
  }

  /**
   * Converts to a plain object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      url: this.url,
      method: this.method,
      ...(this.status !== undefined && { status: this.status }),
      ...(this.headers !== undefined && { headers: this.headers }),
      ...(this.bodyText !== undefined && { bodyText: this.bodyText }),
    };
  }
}

/**
 * Creates a network error
 */
export function createNetworkError(url: string, method: HttpMethod, cause: unknown): SonioxHttpError {
  const message = cause instanceof Error ? cause.message : 'Network request failed';
  return new SonioxHttpError({
    code: 'network_error',
    message: `Network error: ${message}`,
    url,
    method,
    cause,
  });
}

/**
 * Creates a timeout error
 */
export function createTimeoutError(url: string, method: HttpMethod, timeoutMs: number): SonioxHttpError {
  return new SonioxHttpError({
    code: 'timeout',
    message: `Request timed out after ${timeoutMs}ms`,
    url,
    method,
  });
}

/**
 * Creates an abort error
 */
export function createAbortError(url: string, method: HttpMethod, cause?: unknown): SonioxHttpError {
  return new SonioxHttpError({
    code: 'aborted',
    message: 'Request was aborted',
    url,
    method,
    cause,
  });
}

/**
 * Creates an HTTP error (non-2xx status)
 */
export function createHttpError(
  url: string,
  method: HttpMethod,
  status: number,
  headers: Record<string, string>,
  bodyText: string
): SonioxHttpError {
  const cappedBody = truncateBodyText(bodyText);
  return new SonioxHttpError({
    code: 'http_error',
    message: `HTTP ${status}`,
    url,
    method,
    status,
    headers,
    bodyText: cappedBody,
  });
}

/**
 * Creates a parse error (invalid JSON, etc.)
 */
export function createParseError(url: string, method: HttpMethod, bodyText: string, cause: unknown): SonioxHttpError {
  const message = cause instanceof Error ? cause.message : 'Failed to parse response';
  const cappedBody = truncateBodyText(bodyText);
  return new SonioxHttpError({
    code: 'parse_error',
    message: `Parse error: ${message}`,
    url,
    method,
    bodyText: cappedBody,
    cause,
  });
}

/**
 * Truncates body text to the maximum allowed length
 */
function truncateBodyText(text: string): string {
  if (text.length <= MAX_BODY_TEXT_LENGTH) {
    return text;
  }
  return text.slice(0, MAX_BODY_TEXT_LENGTH) + '... [truncated]';
}

/**
 * Type guard to check if an error is an AbortError
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TimeoutError';
  }
  return false;
}

/**
 * Type guard to check if an error is a SonioxHttpError
 */
export function isSonioxHttpError(error: unknown): error is SonioxHttpError {
  return error instanceof SonioxHttpError;
}

/**
 * Checks if an error is a 404 Not Found error
 */
export function isNotFoundError(error: unknown): boolean {
  return isSonioxHttpError(error) && error.status === 404;
}
