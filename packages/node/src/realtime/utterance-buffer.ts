import type {
  RealtimeResult,
  RealtimeSegment,
  RealtimeUtterance,
  RealtimeUtteranceBufferOptions,
} from '../types/public/realtime.js';

import { RealtimeSegmentBuffer } from './segment-buffer.js';

/**
 * Collects real-time results into utterances for endpoint-driven workflows.
 */
export class RealtimeUtteranceBuffer {
  private readonly segmentBuffer: RealtimeSegmentBuffer;
  private pendingSegments: RealtimeSegment[] = [];
  private lastFinalAudioProcMs: number | undefined;
  private lastTotalAudioProcMs: number | undefined;

  constructor(options: RealtimeUtteranceBufferOptions = {}) {
    this.segmentBuffer = new RealtimeSegmentBuffer(options);
  }

  /**
   * Add a real-time result and collect stable segments.
   */
  addResult(result: RealtimeResult): RealtimeSegment[] {
    this.lastFinalAudioProcMs = result.final_audio_proc_ms;
    this.lastTotalAudioProcMs = result.total_audio_proc_ms;

    const stableSegments = this.segmentBuffer.add(result);
    if (stableSegments.length > 0) {
      this.pendingSegments.push(...stableSegments);
    }

    return stableSegments;
  }

  /**
   * Mark an endpoint and flush the current utterance.
   */
  markEndpoint(): RealtimeUtterance | undefined {
    const trailingSegments = this.segmentBuffer.flushAll();
    const segments = [...this.pendingSegments, ...trailingSegments];
    this.pendingSegments = [];

    if (segments.length === 0) {
      return undefined;
    }

    return buildUtterance(segments, this.lastFinalAudioProcMs, this.lastTotalAudioProcMs);
  }

  /**
   * Clear buffered segments and tokens.
   */
  reset(): void {
    this.pendingSegments = [];
    this.segmentBuffer.reset();
  }
}

function buildUtterance(
  segments: RealtimeSegment[],
  finalAudioProcMs: number | undefined,
  totalAudioProcMs: number | undefined
): RealtimeUtterance {
  const tokens = segments.flatMap((segment) => segment.tokens);
  const text = segments.map((segment) => segment.text).join('');
  const start_ms = segments[0]?.start_ms;
  const end_ms = segments[segments.length - 1]?.end_ms;

  const speaker = getCommonValue(segments.map((segment) => segment.speaker));
  const language = getCommonValue(segments.map((segment) => segment.language));

  return {
    text,
    segments,
    tokens,
    start_ms,
    end_ms,
    speaker,
    language,
    final_audio_proc_ms: finalAudioProcMs,
    total_audio_proc_ms: totalAudioProcMs,
  };
}

function getCommonValue<T>(values: Array<T | undefined>): T | undefined {
  let common: T | undefined;
  for (const value of values) {
    if (value === undefined) {
      return undefined;
    }
    if (common === undefined) {
      common = value;
      continue;
    }
    if (value !== common) {
      return undefined;
    }
  }
  return common;
}
