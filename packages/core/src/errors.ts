/**
 * Base error class for all Soniox SDK errors.
 *
 * All SDK errors extend this class for error handling across both REST (HTTP) and WebSocket (Real-time) APIs.
 *
 * @example
 * ```typescript
 * try {
 *   await client.transcribe(file);
 *   await session.connect();
 * } catch (error) {
 *   if (error instanceof SonioxError) {
 *     console.log(error.code);       // 'auth_error', 'network_error', etc.
 *     console.log(error.statusCode); // 401, 500, etc. (when applicable)
 *     console.log(error.toJSON());   // Consistent serialization
 *   }
 * }
 * ```
 */

import type { SonioxErrorCode } from './types/errors.js';

export class SonioxError extends Error {
  /**
   * Error code describing the type of error.
   * Typed as `string` at the base level to allow subclasses (e.g. HTTP errors)
   * to use their own error code unions.
   */
  readonly code: SonioxErrorCode | (string & {});

  /**
   * HTTP status code when applicable (e.g., 401 for auth errors, 500 for server errors).
   */
  readonly statusCode: number | undefined;

  /**
   * The underlying error that caused this error, if any.
   */
  readonly cause: unknown;

  constructor(
    message: string,
    code: SonioxErrorCode | (string & {}) = 'soniox_error',
    statusCode?: number,
    cause?: unknown
  ) {
    super(message);
    this.name = 'SonioxError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Creates a human-readable string representation
   */
  override toString(): string {
    const parts = [`${this.name} [${this.code}]: ${this.message}`];
    if (this.statusCode !== undefined) {
      parts.push(`  Status: ${this.statusCode}`);
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
      ...(this.statusCode !== undefined && { statusCode: this.statusCode }),
    };
  }
}
