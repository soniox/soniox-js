'use client';

/**
 * @soniox/react
 *
 * Official Soniox React SDK
 */

// Components
export { SonioxProvider } from './context.js';

// Hooks
export { useRecording } from './use-recording.js';
export { useSoniox } from './use-soniox.js';
export { useMicrophonePermission } from './use-microphone-permission.js';
export { useAudioLevel } from './use-audio-level.js';

// Headless components
export { AudioLevel } from './audio-level.js';

// Types
export type { SonioxProviderProps } from './context.js';
export type { UseRecordingConfig, UseRecordingReturn, RecordingSnapshot, TokenGroup } from './types/public/index.js';
export type { MicrophonePermissionState } from './use-microphone-permission.js';
export type { UseAudioLevelOptions, UseAudioLevelReturn } from './use-audio-level.js';
export type { AudioLevelProps } from './audio-level.js';
