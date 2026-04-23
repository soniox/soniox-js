/**
 * HTTP error handling for the Soniox SDK.
 *
 * The implementation now lives in `@soniox/core` so it can be shared
 * with the browser-safe `TtsRestClient`. This module is kept as a
 * re-export shim for backwards compatibility with Node SDK callers.
 */

export {
  SonioxError,
  SonioxHttpError,
  createAbortError,
  createHttpError,
  createNetworkError,
  createParseError,
  createTimeoutError,
  isAbortError,
  isNotFoundError,
  isSonioxError,
  isSonioxHttpError,
} from '@soniox/core';
