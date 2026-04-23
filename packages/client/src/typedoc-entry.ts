/**
 * @soniox/client — API Reference
 *
 * @packageDocumentation
 */

// Main client
export { SonioxClient } from './client.js';

// Recording
export { Recording } from './recording.js';

// Auth
export { resolveApiKey } from './auth.js';

// Audio sources
export { MicrophoneSource } from './audio/microphone.js';

// Audio errors
export { AudioPermissionError, AudioDeviceError, AudioUnavailableError } from './audio/errors.js';

// Permissions
export { BrowserPermissionResolver } from './permissions/browser.js';

// TTS classes (from @soniox/core)
export { RealtimeTtsConnection, RealtimeTtsStream, TtsRestClient } from '@soniox/core';

// Errors (from @soniox/core)
export { SonioxError, SonioxHttpError } from '@soniox/core';

// Public types — Client
export type { SonioxClientOptions, SttOptions, ClientTtsFactory } from './client.js';

// Public types — Recording
export type { RecordingState, RecordingEvents, RecordOptions } from './recording.js';

// Public types — Auth
export type { ApiKeyConfig } from './auth.js';

// Public types — Audio
export type { AudioSource, AudioSourceHandlers } from './audio/types.js';
export type { MicrophoneSourceOptions } from './audio/microphone.js';

// Public types — Audio errors
export type { AudioErrorCode } from './audio/errors.js';

// Public types — Permissions
export type { PermissionResolver, PermissionResult, PermissionStatus, PermissionType } from './permissions/types.js';

// Public types — TTS
export type {
  GenerateSpeechOptions,
  TtsAudioFormat,
  TtsConnectionEvents,
  TtsConnectionOptions,
  TtsStreamConfig,
  TtsStreamEvents,
  TtsStreamInput,
  TtsStreamState,
} from '@soniox/core';

// Public types — HTTP errors
export type { HttpErrorCode, HttpErrorDetails, HttpMethod } from '@soniox/core';
