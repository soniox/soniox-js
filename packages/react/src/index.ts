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
export { useTts } from './use-tts.js';
export { useSoniox } from './use-soniox.js';
export { useMicrophonePermission } from './use-microphone-permission.js';
export { useAudioLevel } from './use-audio-level.js';

// Headless components
export { AudioLevel } from './audio-level.js';

// Types
export type { SonioxProviderProps, SonioxProviderConfigProps, SonioxProviderClientProps } from './context.js';
export type { UseRecordingConfig, UseRecordingReturn, RecordingSnapshot, TokenGroup } from './types/public/index.js';
export type { UseTtsConfig, UseTtsReturn } from './use-tts.js';
export type { TtsSnapshot, TtsState } from './tts-store.js';
export type { MicrophonePermissionState } from './use-microphone-permission.js';
export type { UseAudioLevelOptions, UseAudioLevelReturn } from './use-audio-level.js';
export type { AudioLevelProps } from './audio-level.js';
