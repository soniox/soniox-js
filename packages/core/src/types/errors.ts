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
export type SonioxErrorCode = RealtimeErrorCode | 'soniox_error';
