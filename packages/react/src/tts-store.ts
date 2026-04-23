/**
 * TtsStore — external mutable store consumed by `useSyncExternalStore`
 *
 * Manages TTS stream lifecycle state and dispatches callbacks
 * when audio events arrive.
 */

import type { RealtimeTtsStream } from '@soniox/client';

/**
 * Aggregate state for the TTS hook.
 */
export type TtsState = 'idle' | 'connecting' | 'speaking' | 'stopping' | 'error';

/**
 * Immutable snapshot of the TTS state exposed to React.
 */
export interface TtsSnapshot {
  readonly state: TtsState;
  readonly isSpeaking: boolean;
  readonly isConnecting: boolean;
  readonly error: Error | null;
}

const IDLE_SNAPSHOT: TtsSnapshot = {
  state: 'idle',
  isSpeaking: false,
  isConnecting: false,
  error: null,
};

function buildSnapshot(state: TtsState, error: Error | null): TtsSnapshot {
  return {
    state,
    isSpeaking: state === 'speaking',
    isConnecting: state === 'connecting',
    error,
  };
}

export class TtsStore {
  private snapshot: TtsSnapshot = IDLE_SNAPSHOT;
  private listeners = new Set<() => void>();
  private stream: RealtimeTtsStream | null = null;

  // Callback refs — set every render by the hook, read from event handlers.
  onAudio: ((chunk: Uint8Array) => void) | null = null;
  onAudioEnd: (() => void) | null = null;
  onTerminated: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onStateChange: ((event: { old_state: TtsState; new_state: TtsState }) => void) | null = null;

  /** Attach a TTS stream and listen to its events. */
  attach(stream: RealtimeTtsStream): void {
    this.detach();
    this.stream = stream;

    stream.on('audio', this.handleAudio);
    stream.on('audioEnd', this.handleAudioEnd);
    stream.on('terminated', this.handleTerminated);
    stream.on('error', this.handleError);

    this.setState('speaking');
  }

  /** Detach from the current TTS stream. */
  detach(): void {
    if (!this.stream) return;
    this.stream.off('audio', this.handleAudio);
    this.stream.off('audioEnd', this.handleAudioEnd);
    this.stream.off('terminated', this.handleTerminated);
    this.stream.off('error', this.handleError);
    this.stream = null;
  }

  /** Reset to idle state. */
  reset(): void {
    this.detach();
    this.snapshot = IDLE_SNAPSHOT;
    this.notify();
  }

  /** Set connecting state (before stream is attached). */
  setConnecting(): void {
    this.setState('connecting');
  }

  /** Set stopping state (finish sent, waiting for terminated). */
  setStopping(): void {
    if (this.snapshot.state === 'speaking') {
      this.setState('stopping');
    }
  }

  // useSyncExternalStore interface
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TtsSnapshot => this.snapshot;

  getServerSnapshot = (): TtsSnapshot => IDLE_SNAPSHOT;

  /** Set the TTS state directly (used by REST mode in useTts). */
  setState(newState: TtsState): void {
    const oldState = this.snapshot.state;
    if (oldState === newState) return;

    this.snapshot = buildSnapshot(newState, newState === 'error' ? this.snapshot.error : null);
    this.onStateChange?.({ old_state: oldState, new_state: newState });
    this.notify();
  }

  /** Set error state directly (used by REST mode in useTts). */
  setError(error: Error): void {
    this.snapshot = buildSnapshot('error', error);
    this.onError?.(error);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private handleAudio = (chunk: Uint8Array): void => {
    this.onAudio?.(chunk);
  };

  private handleAudioEnd = (): void => {
    this.onAudioEnd?.();
  };

  private handleTerminated = (): void => {
    this.onTerminated?.();
    this.setState('idle');
    this.detach();
  };

  private handleError = (error: Error): void => {
    this.snapshot = buildSnapshot('error', error);
    this.onError?.(error);
    this.notify();
    this.detach();
  };
}
