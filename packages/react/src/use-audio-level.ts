/**
 * useAudioLevel — hook for real-time audio volume and spectrum data
 *
 * Returns an animatable `volume` (0-1) updated every animation frame, and
 * optionally an array of frequency `bands` for spectrum visualizers.
 *
 */

import { useEffect, useRef, useState } from 'react';

export interface UseAudioLevelOptions {
  /** Whether volume metering is active. When false, resources are released. */
  active?: boolean | undefined;

  /**
   * Exponential smoothing factor (0-1). Higher = smoother/slower decay.
   * @default 0.85
   */
  smoothing?: number | undefined;

  /**
   * FFT size for the AnalyserNode. Must be a power of 2.
   * Higher values give more frequency resolution (more bins per band)
   * but update less frequently.
   * @default 256
   */
  fftSize?: number | undefined;

  /**
   * Number of frequency bands to return. When set, the `bands` array
   * is populated with per-band levels (0-1). Useful for spectrum/equalizer
   * visualizations.
   */
  bands?: number | undefined;
}

export interface UseAudioLevelReturn {
  /** Current volume level, 0 to 1. Updated every animation frame. */
  volume: number;

  /**
   * Per-band frequency levels, each 0-1. Empty array when the `bands`
   * option is not set.
   */
  bands: readonly number[];
}

const DEFAULT_SMOOTHING = 0.85;
const DEFAULT_FFT_SIZE = 256;
const MIN_FFT_SIZE = 32;
const MAX_FFT_SIZE = 32768;
const EMPTY_BANDS: readonly number[] = Object.freeze([]);

/** Clamp smoothing to [0, 1]. */
function sanitizeSmoothing(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_SMOOTHING;
  return Math.max(0, Math.min(1, value));
}

/** Ensure fftSize is a power of 2 in [32, 32768]. */
function sanitizeFftSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < MIN_FFT_SIZE) return DEFAULT_FFT_SIZE;
  const clamped = Math.min(MAX_FFT_SIZE, Math.max(MIN_FFT_SIZE, Math.round(value)));
  // Round to nearest power of 2.
  return Math.pow(2, Math.round(Math.log2(clamped)));
}

/** Ensure bands is a positive integer, or undefined. */
function sanitizeBands(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 1) return undefined;
  return Math.max(1, Math.floor(value));
}

/**
 * Compute RMS volume from time-domain waveform data
 * Input: Uint8Array where 128 = silence, 0/255 = max amplitude
 * Output: 0-1 normalized volume
 */
function computeRMS(data: Uint8Array): number {
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const sample = data[i]! / 128 - 1; // normalize to -1..+1
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / data.length);
  return Math.min(1, rms);
}

/**
 * Group frequency bins into N bands using logarithmic spacing.
 * Low bands (bass) get fewer bins, high bands get more bins
 *
 * Input: Uint8Array of frequency magnitudes (0-255).
 * Output is written into the pre-allocated `out` array to avoid per-frame
 * allocations (this runs at ~60 fps).
 */
function computeBands(data: Uint8Array, bandCount: number, out: number[]): void {
  const binCount = data.length;

  for (let b = 0; b < bandCount; b++) {
    const startNorm = b / bandCount;
    const endNorm = (b + 1) / bandCount;
    const start = Math.round(binCount * startNorm * startNorm);
    const end = Math.max(start + 1, Math.round(binCount * endNorm * endNorm));

    let sum = 0;
    const count = Math.min(end, binCount) - start;
    for (let i = start; i < end && i < binCount; i++) {
      sum += data[i]!;
    }
    out[b] = count > 0 ? sum / (count * 255) : 0;
  }
}

export function useAudioLevel(options?: UseAudioLevelOptions): UseAudioLevelReturn {
  const active = options?.active ?? false;

  // Sanitize fftSize into a stable value used as an effect dependency.
  // When it changes, the audio pipeline is recreated (new AnalyserNode + buffers).
  const fftSize = sanitizeFftSize(options?.fftSize);

  // Refs for values read per-frame without restarting the effect.
  // All inputs are sanitized to prevent runtime crashes from invalid values.
  const smoothingRef = useRef(sanitizeSmoothing(options?.smoothing));
  smoothingRef.current = sanitizeSmoothing(options?.smoothing);

  const bandCountRef = useRef(sanitizeBands(options?.bands));
  bandCountRef.current = sanitizeBands(options?.bands);

  // State returned to the consumer.
  const [state, setState] = useState<{ volume: number; bands: readonly number[] }>({
    volume: 0,
    bands: EMPTY_BANDS,
  });

  useEffect(() => {
    if (!active) {
      setState({ volume: 0, bands: EMPTY_BANDS });
      return;
    }

    // Guard: getUserMedia must be available.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;

    // Smoothed values persisted across frames.
    let smoothedVolume = 0;
    let smoothedBands: number[] | null = null;
    let rawBandsBuffer: number[] | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Permission denied or device unavailable — stay silent.
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;

      source.connect(analyser);

      // Reusable buffers.
      const timeDomainBuffer = new Uint8Array(analyser.fftSize);
      const frequencyBinCount = analyser.frequencyBinCount; // fftSize / 2
      const frequencyBuffer = new Uint8Array(frequencyBinCount);

      function tick() {
        if (cancelled) return;

        const smoothing = smoothingRef.current;
        const bands = bandCountRef.current;

        // Volume: RMS from time-domain data.
        analyser.getByteTimeDomainData(timeDomainBuffer);
        const rawVolume = computeRMS(timeDomainBuffer);
        smoothedVolume = smoothedVolume * smoothing + rawVolume * (1 - smoothing);

        // Bands: frequency data grouped into N bands.
        let bandsResult: readonly number[];
        if (bands !== undefined && bands > 0) {
          analyser.getByteFrequencyData(frequencyBuffer);
          const effectiveBands = Math.min(bands, frequencyBinCount);

          // Reuse buffers across frames to avoid per-frame allocations (~60 fps).
          if (rawBandsBuffer === null || rawBandsBuffer.length !== effectiveBands) {
            rawBandsBuffer = new Array<number>(effectiveBands).fill(0);
          }
          if (smoothedBands === null || smoothedBands.length !== effectiveBands) {
            smoothedBands = new Array<number>(effectiveBands).fill(0);
          }

          computeBands(frequencyBuffer, effectiveBands, rawBandsBuffer);

          for (let i = 0; i < effectiveBands; i++) {
            smoothedBands[i] = smoothedBands[i]! * smoothing + rawBandsBuffer[i]! * (1 - smoothing);
          }

          // Snapshot for React state; smoothedBands is mutated in-place on the
          // next frame so we need a fresh copy. The readonly type annotation
          // provides compile-time immutability; runtime freeze is unnecessary.
          bandsResult = [...smoothedBands];
        } else {
          bandsResult = EMPTY_BANDS;
        }

        setState({ volume: smoothedVolume, bands: bandsResult });
        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);
    }

    void start();

    return () => {
      cancelled = true;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      if (audioContext !== null) {
        void audioContext.close().catch(() => {});
        audioContext = null;
      }

      if (stream !== null) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      setState({ volume: 0, bands: EMPTY_BANDS });
    };
  }, [active, fftSize]); // Restart when active or fftSize changes

  return state;
}
