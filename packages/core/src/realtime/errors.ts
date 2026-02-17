/**
 * Real-time (WebSocket) API error classes for the Soniox SDK
 * All real-time errors extend SonioxError
 */

import { SonioxError } from '../errors.js';
import type { RealtimeErrorCode } from '../types/errors.js';

/**
 * Base error class for all real-time (WebSocket) SDK errors
 */
export class RealtimeError extends SonioxError {
  /** Real-time error code */
  declare readonly code: RealtimeErrorCode;

  /**
   * Original response payload for debugging.
   * Contains the raw WebSocket message that caused the error.
   */
  readonly raw: unknown;

  constructor(message: string, code: RealtimeErrorCode = 'realtime_error', statusCode?: number, raw?: unknown) {
    super(message, code, statusCode);
    this.name = 'RealtimeError';
    this.raw = raw;
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
  override toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.statusCode !== undefined && { statusCode: this.statusCode }),
      ...(this.raw !== undefined && { raw: this.raw }),
    };
  }
}

/**
 * Authentication error (401).
 * Thrown when the API key is invalid or expired.
 */
export class AuthError extends RealtimeError {
  constructor(message: string, statusCode?: number, raw?: unknown) {
    super(message, 'auth_error', statusCode, raw);
    this.name = 'AuthError';
  }
}

/**
 * Bad request error (400).
 * Thrown for invalid configuration or parameters.
 */
export class BadRequestError extends RealtimeError {
  constructor(message: string, statusCode?: number, raw?: unknown) {
    super(message, 'bad_request', statusCode, raw);
    this.name = 'BadRequestError';
  }
}

/**
 * Quota error (402, 429).
 * Thrown when rate limits are exceeded or quota is exhausted.
 */
export class QuotaError extends RealtimeError {
  constructor(message: string, statusCode?: number, raw?: unknown) {
    super(message, 'quota_exceeded', statusCode, raw);
    this.name = 'QuotaError';
  }
}

/**
 * Connection error.
 * Thrown for WebSocket connection failures and transport errors.
 */
export class ConnectionError extends RealtimeError {
  constructor(message: string, raw?: unknown) {
    super(message, 'connection_error', undefined, raw);
    this.name = 'ConnectionError';
  }
}

/**
 * Network error.
 * Thrown for server-side network issues (408, 500, 503).
 */
export class NetworkError extends RealtimeError {
  constructor(message: string, statusCode?: number, raw?: unknown) {
    super(message, 'network_error', statusCode, raw);
    this.name = 'NetworkError';
  }
}

/**
 * Abort error.
 * Thrown when an operation is cancelled via AbortSignal.
 */
export class AbortError extends RealtimeError {
  constructor(message = 'Operation aborted') {
    super(message, 'aborted');
    this.name = 'AbortError';
  }
}

/**
 * State error.
 * Thrown when an operation is attempted in an invalid state.
 */
export class StateError extends RealtimeError {
  constructor(message: string) {
    super(message, 'state_error');
    this.name = 'StateError';
  }
}

/**
 * Map a Soniox error response to a typed error class.
 *
 * @param response - Error response from the WebSocket
 * @returns Appropriate error subclass
 */
export function mapErrorResponse(response: { error_code?: number; error_message?: string }): RealtimeError {
  const { error_code, error_message } = response;
  const message = error_message ?? 'Unknown error';

  switch (error_code) {
    case 401:
      return new AuthError(message, error_code, response);

    case 400:
      return new BadRequestError(message, error_code, response);

    case 402:
    case 429:
      return new QuotaError(message, error_code, response);

    case 408:
    case 500:
    case 503:
      return new NetworkError(message, error_code, response);

    default:
      return new RealtimeError(message, 'realtime_error', error_code, response);
  }
}
