/**
 * Browser microphone audio source using getUserMedia + MediaRecorder
 */

import { AudioDeviceError, AudioPermissionError, AudioUnavailableError } from './errors.js';
import type { AudioSource, AudioSourceHandlers } from './types.js';

const DEFAULT_TIMESLICE_MS = 120;

const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: 44100,
};

/**
 * Options for MicrophoneSource
 */
export type MicrophoneSourceOptions = {
  /**
   * MediaTrackConstraints for the audio track.
   * @default { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 44100 }
   */
  constraints?: MediaTrackConstraints | undefined;

  /**
   * MediaRecorder options.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder
   */
  recorderOptions?: MediaRecorderOptions | undefined;

  /**
   * Time interval in milliseconds between audio data chunks.
   * @default 120
   */
  timesliceMs?: number | undefined;
};

/**
 * Browser microphone audio source
 *
 * Uses `navigator.mediaDevices.getUserMedia` to capture audio from the microphone
 * and `MediaRecorder` to encode it into chunks.
 *
 * @example
 * ```typescript
 * const source = new MicrophoneSource();
 * await source.start({
 *   onData: (chunk) => session.sendAudio(chunk),
 *   onError: (err) => console.error(err),
 * });
 * // Later:
 * source.stop();
 * ```
 */
export class MicrophoneSource implements AudioSource {
  private readonly constraints: MediaTrackConstraints;
  private readonly recorderOptions: MediaRecorderOptions;
  private readonly timesliceMs: number;

  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  // Bound event handlers for cleanup
  private boundOnData: ((event: BlobEvent) => void) | null = null;
  private boundOnError: ((event: Event) => void) | null = null;

  // Guards against concurrent start() calls (see below).
  private startGeneration = 0;

  constructor(options: MicrophoneSourceOptions = {}) {
    this.constraints = options.constraints ?? DEFAULT_AUDIO_CONSTRAINTS;
    this.recorderOptions = options.recorderOptions ?? {};
    this.timesliceMs = options.timesliceMs ?? DEFAULT_TIMESLICE_MS;
  }

  /**
   * Request microphone access and start recording
   *
   * @throws AudioUnavailableError if getUserMedia or MediaRecorder is not supported
   * @throws AudioPermissionError if microphone access is denied
   * @throws AudioDeviceError if no microphone is found
   */
  async start(handlers: AudioSourceHandlers): Promise<void> {
    // Stop any previous capture to prevent resource leaks on double-start.
    this.stop();

    // Increment generation so a stale concurrent start() can detect it was
    // superseded while awaiting getUserMedia.
    const generation = ++this.startGeneration;

    // Check for browser support
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new AudioUnavailableError('navigator.mediaDevices.getUserMedia is not available');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new AudioUnavailableError('MediaRecorder is not available');
    }

    // Request microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: this.constraints });
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new AudioPermissionError('Microphone access denied by user', err);
        }
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new AudioDeviceError('No microphone found', err);
        }
        if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          throw new AudioDeviceError('Microphone is already in use or not readable', err);
        }
      }
      throw new AudioUnavailableError(err instanceof Error ? err.message : 'Failed to access microphone', err);
    }

    // A newer start() or stop() was called while we were awaiting getUserMedia.
    // Release the stream we just acquired to avoid orphaning it.
    if (generation !== this.startGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = stream;

    // Create MediaRecorder
    try {
      const recorder = new MediaRecorder(stream, this.recorderOptions);
      this.mediaRecorder = recorder;

      this.boundOnData = (event: BlobEvent) => {
        if (event.data.size > 0) {
          void event.data.arrayBuffer().then(
            (buffer) => handlers.onData(buffer),
            (err: unknown) => handlers.onError(err instanceof Error ? err : new Error(String(err)))
          );
        }
      };

      this.boundOnError = (event: Event) => {
        const errorEvent = event as ErrorEvent;
        const error = new Error(errorEvent.message || 'MediaRecorder error');
        handlers.onError(error);
      };

      recorder.addEventListener('dataavailable', this.boundOnData);
      recorder.addEventListener('error', this.boundOnError);

      // Start recording
      recorder.start(this.timesliceMs);
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.mediaRecorder = null;
      throw new AudioUnavailableError(err instanceof Error ? err.message : 'Failed to start MediaRecorder', err);
    }
  }

  /**
   * Stop recording and release all resources
   */
  stop(): void {
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== 'inactive') {
        const recorder = this.mediaRecorder;
        const onData = this.boundOnData;
        const onError = this.boundOnError;
        recorder.addEventListener(
          'stop',
          () => {
            if (onData) recorder.removeEventListener('dataavailable', onData);
            if (onError) recorder.removeEventListener('error', onError);
          },
          { once: true }
        );
        recorder.stop();
      } else {
        // Already inactive — remove listeners directly.
        if (this.boundOnData) {
          this.mediaRecorder.removeEventListener('dataavailable', this.boundOnData);
        }
        if (this.boundOnError) {
          this.mediaRecorder.removeEventListener('error', this.boundOnError);
        }
      }

      this.boundOnData = null;
      this.boundOnError = null;
      this.mediaRecorder = null;
    }

    // Stop all tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /**
   * Pause audio capture
   */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  /**
   * Resume audio capture
   */
  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }
}
