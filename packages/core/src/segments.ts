import type { SegmentGroupKey } from './types/transcriptions.js';

type SegmentTokensOptions = {
  group_by?: SegmentGroupKey[] | undefined;
};

type SegmentableToken = {
  speaker?: string | null | undefined;
  language?: string | null | undefined;
};

const DEFAULT_GROUP_BY: SegmentGroupKey[] = ['speaker', 'language'];

export function segmentTokens<TToken extends SegmentableToken, TSegment>(
  tokens: TToken[],
  options: SegmentTokensOptions | undefined,
  buildSegment: (tokens: TToken[], speaker: string | null | undefined, language: string | null | undefined) => TSegment
): TSegment[] {
  if (tokens.length === 0) {
    return [];
  }

  const groupBy = options?.group_by ?? DEFAULT_GROUP_BY;
  const groupBySpeaker = groupBy.includes('speaker');
  const groupByLanguage = groupBy.includes('language');

  const segments: TSegment[] = [];
  let currentTokens: TToken[] = [];
  let currentSpeaker: string | null | undefined;
  let currentLanguage: string | null | undefined;

  for (const token of tokens) {
    const speakerChanged = groupBySpeaker && token.speaker !== currentSpeaker;
    const languageChanged = groupByLanguage && token.language !== currentLanguage;

    if (currentTokens.length > 0 && (speakerChanged || languageChanged)) {
      segments.push(buildSegment(currentTokens, currentSpeaker, currentLanguage));
      currentTokens = [];
    }

    currentTokens.push(token);
    currentSpeaker = token.speaker;
    currentLanguage = token.language;
  }

  if (currentTokens.length > 0) {
    segments.push(buildSegment(currentTokens, currentSpeaker, currentLanguage));
  }

  return segments;
}
