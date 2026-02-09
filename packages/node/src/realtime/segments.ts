import { segmentTokens } from '../async/segments.js';
import type { RealtimeSegment, RealtimeSegmentOptions, RealtimeToken } from '../types/public/realtime.js';

/**
 * Groups real-time tokens into segments based on specified grouping keys.
 *
 * A new segment starts when any of the `group_by` fields changes.
 * Tokens are concatenated as-is.
 *
 * @param tokens - Array of real-time tokens to segment
 * @param options - Segmentation options
 * @param options.group_by - Fields to group by (default: ['speaker', 'language'])
 * @param options.final_only - When true, only finalized tokens are included
 * @returns Array of segments with combined text and timing (if available)
 */
export function segmentRealtimeTokens(
  tokens: RealtimeToken[],
  options: RealtimeSegmentOptions = {}
): RealtimeSegment[] {
  const filteredTokens = options.final_only ? tokens.filter((token) => token.is_final) : tokens;
  return segmentTokens(filteredTokens, options, buildSegment);
}

function buildSegment(
  tokens: RealtimeToken[],
  speaker: string | null | undefined,
  language: string | null | undefined
): RealtimeSegment {
  const firstToken = tokens[0];
  const lastToken = tokens[tokens.length - 1];

  if (!firstToken || !lastToken) {
    throw new Error('Cannot build segment from an empty token array');
  }

  const text = tokens.map((t) => t.text).join('');

  return {
    text,
    start_ms: firstToken.start_ms,
    end_ms: lastToken.end_ms,
    ...(!!speaker && { speaker }),
    ...(!!language && { language }),
    tokens,
  };
}
