/**
 * Unified error types for the Soniox SDK
 *
 * All SDK errors extend SonioxError, providing a consistent interface
 * for error handling across both REST (HTTP) and WebSocket (Real-time) APIs.
 *
 * HTTP error types live in `@soniox/core` (shared with `@soniox/client`);
 * this module re-exports them for backwards compatibility.
 */

export type { RealtimeErrorCode, SonioxErrorCode, HttpErrorCode, HttpErrorDetails, HttpMethod } from '@soniox/core';
