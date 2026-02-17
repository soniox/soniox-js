/**
 * Unified error types for the Soniox SDK
 *
 * All SDK errors extend SonioxError, providing a consistent interface
 * for error handling across both REST (HTTP) and WebSocket (Real-time) APIs.
 */

// Re-export shared error types from @soniox/core
import type { RealtimeErrorCode } from '@soniox/core';
export type { RealtimeErrorCode } from '@soniox/core';

/**
 * Error codes for HTTP client errors
 */
export type HttpErrorCode = 'network_error' | 'timeout' | 'aborted' | 'http_error' | 'parse_error';

/**
 * All possible SDK error codes (core real-time + HTTP-specific codes)
 */
export type SonioxErrorCode = RealtimeErrorCode | 'soniox_error' | HttpErrorCode;

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
