/**
 * @soniox/react — API Reference
 *
 * @packageDocumentation
 */

// Components
export { SonioxProvider } from './context.js';
export { AudioLevel } from './audio-level.js';

// Hooks
export { useRecording } from './use-recording.js';
export { useSoniox } from './use-soniox.js';
export { useMicrophonePermission } from './use-microphone-permission.js';
export { useAudioLevel } from './use-audio-level.js';

// Utilities
export { checkAudioSupport } from './support.js';

// Public types — Provider
export type { SonioxProviderProps } from './context.js';

// Public types — useRecording
export type { UseRecordingConfig, UseRecordingReturn } from './use-recording.js';
export type { RecordingSnapshot } from './store.js';

// Public types — useMicrophonePermission
export type { MicrophonePermissionState, UseMicrophonePermissionOptions } from './use-microphone-permission.js';

// Public types — useAudioLevel / AudioLevel
export type { UseAudioLevelOptions, UseAudioLevelReturn } from './use-audio-level.js';
export type { AudioLevelProps } from './audio-level.js';

// Public types — Support
export type { UnsupportedReason, AudioSupportResult } from './support.js';
