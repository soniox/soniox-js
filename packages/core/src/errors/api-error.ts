/**
 * API error classes for HTTP errors returned by the Soniox API
 */

import { SonioxError } from './base.js';

/** Raw error response from the API */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Error thrown when the API returns an error response
 */
export class SonioxAPIError extends SonioxError {
  /** HTTP status code */
  readonly status: number;
  /** Raw error response from the API */
  readonly response: ApiErrorResponse | undefined;
  /** Request ID for debugging */
  readonly requestId: string | undefined;

  constructor(
    message: string,
    status: number,
    code: string,
    response?: ApiErrorResponse,
    requestId?: string
  ) {
    super(message, code);
    this.name = 'SonioxAPIError';
    this.status = status;
    this.response = response;
    this.requestId = requestId;
  }
}
