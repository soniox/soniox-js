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

// Concurrency Limits API
export { SonioxConcurrencyLimitsAPI } from './async/concurrency-limits.js';

// Files API
export { FileListResult, SonioxFile } from './async/files.js';

// STT API
export {
  segmentTranscript,
  SonioxTranscript,
  SonioxTranscription,
  SonioxTranslationJob,
  TranscriptionListResult,
} from './async/stt.js';

// Translation helper
export { translateFromTranscript } from './async/translation.js';

// TTS API
export { SonioxTtsApi } from './async/tts.js';

// Usage Logs API
export { SonioxUsageLogsAPI, UsageLogListResult } from './async/usage-logs.js';

// Real-time API
export {
  SonioxRealtimeApi,
  RealtimeSttSession,
  RealtimeTtsConnection,
  RealtimeTtsStream,
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
