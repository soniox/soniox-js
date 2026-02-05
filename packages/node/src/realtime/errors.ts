/**
 * Base error class for all realtime SDK errors.
 */
export class RealtimeError extends Error {
  /**
   * Error code from the Soniox API (if available).
   */
  readonly code: number | undefined;

  /**
   * Original response payload for debugging.
   */
  readonly raw: unknown;

  constructor(message: string, code?: number, raw?: unknown) {
    super(message);
    this.name = 'RealtimeError';
    this.code = code;
    this.raw = raw;

    // Maintains proper stack trace in V8 (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error (401).
 * Thrown when the API key is invalid or expired.
 */
export class AuthError extends RealtimeError {
  constructor(message: string, code?: number, raw?: unknown) {
    super(message, code, raw);
    this.name = 'AuthError';
  }
}

/**
 * Bad request error (400).
 * Thrown for invalid configuration or parameters.
 */
export class BadRequestError extends RealtimeError {
  constructor(message: string, code?: number, raw?: unknown) {
    super(message, code, raw);
    this.name = 'BadRequestError';
  }
}

/**
 * Quota error (402, 429).
 * Thrown when rate limits are exceeded or quota is exhausted.
 */
export class QuotaError extends RealtimeError {
  constructor(message: string, code?: number, raw?: unknown) {
    super(message, code, raw);
    this.name = 'QuotaError';
  }
}

/**
 * Connection error.
 * Thrown for WebSocket connection failures and transport errors.
 */
export class ConnectionError extends RealtimeError {
  constructor(message: string, raw?: unknown) {
    super(message, undefined, raw);
    this.name = 'ConnectionError';
  }
}

/**
 * Network error.
 * Thrown for server-side network issues (408, 500, 503).
 */
export class NetworkError extends RealtimeError {
  constructor(message: string, code?: number, raw?: unknown) {
    super(message, code, raw);
    this.name = 'NetworkError';
  }
}

/**
 * Abort error.
 * Thrown when an operation is cancelled via AbortSignal.
 */
export class AbortError extends RealtimeError {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * State error.
 * Thrown when an operation is attempted in an invalid state.
 */
export class StateError extends RealtimeError {
  constructor(message: string) {
    super(message);
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
      return new RealtimeError(message, error_code, response);
  }
}
