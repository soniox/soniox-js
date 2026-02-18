/**
 * Audio-specific error classes for the client SDK
 * These errors are thrown by AudioSource implementations when capture cannot begin
 */

import { SonioxError } from '@soniox/core';

/**
 * Error codes for audio-related errors
 */
export type AudioErrorCode = 'permission_denied' | 'device_not_found' | 'audio_unavailable';

/**
 * Thrown when microphone access is denied by the user or blocked by the browser.
 *
 * Maps to `getUserMedia` `NotAllowedError` DOMException.
 */
export class AudioPermissionError extends SonioxError {
  constructor(message = 'Microphone access denied', cause?: unknown) {
    super(message, 'permission_denied', undefined, cause);
    this.name = 'AudioPermissionError';
  }
}

/**
 * Thrown when no audio input device is found
 *
 * Maps to `getUserMedia` `NotFoundError` DOMException.
 */
export class AudioDeviceError extends SonioxError {
  constructor(message = 'No audio input device found', cause?: unknown) {
    super(message, 'device_not_found', undefined, cause);
    this.name = 'AudioDeviceError';
  }
}

/**
 * Thrown when audio capture is not supported in the current environment
 *
 * For example, when `getUserMedia` or `MediaRecorder` is not available.
 */
export class AudioUnavailableError extends SonioxError {
  constructor(message = 'Audio capture is not supported in this environment', cause?: unknown) {
    super(message, 'audio_unavailable', undefined, cause);
    this.name = 'AudioUnavailableError';
  }
}
