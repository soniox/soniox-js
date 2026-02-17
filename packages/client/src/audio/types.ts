/**
 * Platform-agnostic audio source interface.
 *
 * Implementations handle platform-specific audio capture (browser mic, AudioWorklet, React Native, etc.).
 * Callbacks are passed into `start()` to guarantee they are attached before any data flows.
 */

/**
 * Callbacks for receiving audio data and errors from an AudioSource.
 */
export type AudioSourceHandlers = {
  /**
   * Called when an audio chunk is available.
   * @param chunk - Raw audio data as ArrayBuffer
   */
  onData: (chunk: ArrayBuffer) => void;

  /**
   * Called when a runtime error occurs during audio capture (after start).
   * @param error - The error that occurred
   */
  onError: (error: Error) => void;
};

/**
 * Platform-agnostic audio source interface.
 *
 * Implementations must:
 * - Begin capturing audio in `start()` and deliver chunks via `handlers.onData`
 * - Stop all capture and release resources in `stop()`
 * - Throw typed errors from `start()` if capture cannot begin (e.g., permission denied)
 *
 * @example
 * ```typescript
 * // Built-in browser source
 * const source = new MicrophoneSource();
 *
 * // Custom source (e.g., React Native)
 * class MyAudioSource implements AudioSource {
 *   async start(handlers: AudioSourceHandlers) { ... }
 *   stop() { ... }
 * }
 * ```
 */
export interface AudioSource {
  /**
   * Start capturing audio.
   *
   * @param handlers - Callbacks for audio data and errors
   * @throws AudioPermissionError if microphone access is denied
   * @throws AudioDeviceError if no audio device is found
   * @throws AudioUnavailableError if audio capture is not supported
   */
  start(handlers: AudioSourceHandlers): Promise<void>;

  /**
   * Stop capturing audio and release all resources.
   * Safe to call multiple times.
   */
  stop(): void;

  /**
   * Pause audio capture (optional).
   * When paused, no data should be delivered via onData.
   */
  pause?(): void;

  /**
   * Resume audio capture after pause (optional).
   */
  resume?(): void;
}
