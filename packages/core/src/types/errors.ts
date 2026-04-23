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
 * Error codes for HTTP client errors
 */
export type HttpErrorCode = 'network_error' | 'timeout' | 'aborted' | 'http_error' | 'parse_error';

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

/**
 * All possible SDK error codes (real-time + HTTP-specific codes)
 */
export type SonioxErrorCode = RealtimeErrorCode | 'soniox_error' | HttpErrorCode;
