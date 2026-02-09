/**
 * @soniox/node
 *
 * Official Soniox SDK for Node.js
 */

// Constants
export * from './constants.js';

// Client
export { SonioxNodeClient } from './client.js';

// HTTP module
export * from './http/index.js';

// Files API
export { FileListResult, SonioxFile } from './async/files.js';

// STT API
export { segmentTranscript, SonioxTranscript, SonioxTranscription, TranscriptionListResult } from './async/stt.js';

// Real-time API
export {
  SonioxRealtimeApi,
  RealtimeSttSession,
  segmentRealtimeTokens,
  RealtimeSegmentBuffer,
  RealtimeUtteranceBuffer,
  RealtimeError,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  AbortError,
  StateError,
} from './realtime/index.js';

// Public types
export * from './types/public/index.js';
