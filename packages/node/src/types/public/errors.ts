/**
 * Unified error types for the Soniox SDK
 *
 * All SDK errors extend SonioxError, providing a consistent interface
 * for error handling across both REST (HTTP) and WebSocket (Real-time) APIs.
 */

/**
 * Error codes for HTTP client errors
 */
export type HttpErrorCode = 'network_error' | 'timeout' | 'aborted' | 'http_error' | 'parse_error';

/**
 * Error codes for Real-time (WebSocket) API errors
 */
export type RealtimeErrorCode =
  | 'auth_error'
  | 'bad_request'
  | 'quota_exceeded'
  | 'connection_error'
  | 'network_error'
  | 'aborted'
  | 'state_error'
  | 'realtime_error';

/**
 * All possible SDK error codes
 */
export type SonioxErrorCode = HttpErrorCode | RealtimeErrorCode | 'soniox_error';

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * Error details for SonioxHttpError
 */
export interface HttpErrorDetails {
  code: HttpErrorCode;
  message: string;
  url: string;
  method: HttpMethod;
  statusCode?: number | undefined;
  headers?: Record<string, string> | undefined;
  /** Response body text (capped at 4KB) */
  bodyText?: string | undefined;
  cause?: unknown;
}
