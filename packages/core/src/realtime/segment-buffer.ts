import type {
  RealtimeResult,
  RealtimeSegment,
  RealtimeSegmentBufferOptions,
  RealtimeToken,
} from '../types/realtime.js';

import { segmentRealtimeTokens } from './segments.js';

const DEFAULT_MAX_TOKENS = 2000;

/**
 * Rolling buffer for turning real-time results into stable segments.
 */
export class RealtimeSegmentBuffer {
  private tokens: RealtimeToken[] = [];
  private readonly groupBy: RealtimeSegmentBufferOptions['group_by'];
  private readonly finalOnly: boolean;
  private readonly maxTokens: number | undefined;
  private readonly maxMs: number | undefined;

  constructor(options: RealtimeSegmentBufferOptions = {}) {
    validatePositive('max_tokens', options.max_tokens);
    validatePositive('max_ms', options.max_ms);

    this.groupBy = options.group_by;
    this.finalOnly = options.final_only ?? true;
    this.maxTokens = options.max_tokens ?? DEFAULT_MAX_TOKENS;
    this.maxMs = options.max_ms;
  }

  /**
   * Number of tokens currently buffered.
   */
  get size(): number {
    return this.tokens.length;
  }

  /**
   * Add a real-time result and return stable segments.
   */
  add(result: RealtimeResult): RealtimeSegment[] {
    const incoming = this.finalOnly ? result.tokens.filter((token) => token.is_final) : result.tokens;

    if (incoming.length > 0) {
      this.tokens.push(...incoming);
    }

    const stableSegments = this.flushStable(result.final_audio_proc_ms);
    this.trim();
    return stableSegments;
  }

  /**
   * Clear all buffered tokens.
   */
  reset(): void {
    this.tokens = [];
  }

  /**
   * Flush all buffered tokens into segments and clear the buffer.
   *
   * Includes tokens that are not yet stable by final_audio_proc_ms.
   */
  flushAll(): RealtimeSegment[] {
    if (this.tokens.length === 0) {
      return [];
    }

    const segments = segmentRealtimeTokens(this.tokens, { group_by: this.groupBy });
    this.tokens = [];
    return segments;
  }

  private flushStable(finalAudioProcMs: number): RealtimeSegment[] {
    if (!Number.isFinite(finalAudioProcMs) || finalAudioProcMs <= 0) {
      return [];
    }

    const segments = segmentRealtimeTokens(this.tokens, { group_by: this.groupBy });
    const stableSegments: RealtimeSegment[] = [];
    let dropCount = 0;

    // Only flush segments that are followed by another segment (i.e. a
    // speaker/language boundary occurred).  The last segment is kept in the
    // buffer because more tokens for the same group may arrive in subsequent
    // results.  Use flushAll() to drain remaining tokens (e.g. on endpoint).
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      const lastToken = segment.tokens[segment.tokens.length - 1];
      const endMs = lastToken?.end_ms;
      if (endMs === undefined || endMs > finalAudioProcMs) {
        break;
      }
      stableSegments.push(segment);
      dropCount += segment.tokens.length;
    }

    if (dropCount > 0) {
      this.tokens = this.tokens.slice(dropCount);
    }

    return stableSegments;
  }

  private trim(): void {
    if (this.maxTokens !== undefined && this.tokens.length > this.maxTokens) {
      this.tokens = this.tokens.slice(this.tokens.length - this.maxTokens);
    }

    if (this.maxMs === undefined) {
      return;
    }

    const latestEndMs = findLatestEndMs(this.tokens);
    if (latestEndMs === undefined) {
      return;
    }

    const cutoff = latestEndMs - this.maxMs;
    if (cutoff <= 0) {
      return;
    }

    let dropIndex = 0;
    while (dropIndex < this.tokens.length) {
      const token = this.tokens[dropIndex];
      if (token?.end_ms === undefined || token.end_ms >= cutoff) {
        break;
      }
      dropIndex += 1;
    }

    if (dropIndex > 0) {
      this.tokens = this.tokens.slice(dropIndex);
    }
  }
}

function findLatestEndMs(tokens: RealtimeToken[]): number | undefined {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const endMs = tokens[i]?.end_ms;
    if (typeof endMs === 'number') {
      return endMs;
    }
  }
  return undefined;
}

function validatePositive(name: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`);
  }
}
