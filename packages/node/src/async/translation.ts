import type {
  ISonioxTranscript,
  OneWayTranslation,
  SonioxTranslation,
  TranscriptResponse,
  TranscriptToken,
  TranslateFromTranscriptMode,
  TranslationSegment,
  TwoWayTranslation,
} from '../types/public/index.js';

/**
 * A raw chunk of consecutive tokens that share `(speaker, language, isTranslation)`.
 * Used as the intermediate step before merging adjacent original/translation
 * pairs into a {@link TranslationSegment}.
 */
type RawChunk = {
  speaker: string | undefined;
  language: string | undefined;
  isTranslation: boolean;
  tokens: TranscriptToken[];
};

/**
 * A tokens-bearing transcript-shaped object accepted by
 * {@link translateFromTranscript}.
 */
type TranscriptLike = ISonioxTranscript | TranscriptResponse | { tokens: TranscriptToken[] };

/**
 * Reshape a transcript produced by a translation-enabled transcription into a
 * structured {@link SonioxTranslation} result.
 *
 * This is the same logic `SonioxTranslationJob.getTranslation()` applies.
 * Use it directly in webhook handlers or anywhere else you already have a
 * transcript in hand.
 *
 * @param transcript - Transcript (or any object with a `tokens` array) emitted
 *   for a translation-enabled transcription.
 * @param mode - Whether to reshape as one-way or two-way; the discriminator
 *   tells the helper which result shape to produce.
 * @returns A {@link SonioxTranslation} keyed on `mode`.
 *
 * @example
 * ```typescript
 * import { translateFromTranscript } from '@soniox/node';
 *
 * // From a webhook handler that just received the transcript
 * const result = translateFromTranscript(transcript, { type: 'one_way', to: 'es' });
 * console.log(result.translation_text);
 * ```
 */
export function translateFromTranscript(
  transcript: TranscriptLike,
  mode: TranslateFromTranscriptMode
): SonioxTranslation {
  const segments = reshapeTokens(transcript.tokens);
  const duration_ms = computeDurationMs(transcript.tokens);

  if (mode.type === 'two_way') {
    const result: TwoWayTranslation = {
      mode: 'two_way',
      language_a: mode.language_a,
      language_b: mode.language_b,
      duration_ms,
      segments,
    };
    return result;
  }

  let original_text = '';
  let translation_text = '';
  for (const segment of segments) {
    for (const token of segment.original_tokens) {
      original_text += token.text;
    }
    for (const token of segment.translation_tokens ?? []) {
      translation_text += token.text;
    }
  }

  const result: OneWayTranslation = {
    mode: 'one_way',
    ...(mode.from !== undefined && { from: mode.from }),
    to: mode.to,
    duration_ms,
    segments,
    original_text,
    translation_text,
  };
  return result;
}

/**
 * Reshape a flat token stream into per-utterance translation segments.
 *
 * Internal step; exported only via {@link translateFromTranscript}.
 */
function reshapeTokens(tokens: TranscriptToken[]): TranslationSegment[] {
  if (tokens.length === 0) {
    return [];
  }

  const chunks = splitIntoChunks(tokens);
  return mergeChunks(chunks);
}

/**
 * Walk tokens in order and start a new chunk whenever the speaker, language
 * (target lang for translations, source lang otherwise), or "is this a
 * translation token" flag changes.
 */
function splitIntoChunks(tokens: TranscriptToken[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let current: RawChunk | null = null;

  for (const token of tokens) {
    const speaker = token.speaker ?? undefined;
    const language = token.language ?? undefined;
    const isTranslation = token.translation_status === 'translation';

    if (
      current === null ||
      current.speaker !== speaker ||
      current.language !== language ||
      current.isTranslation !== isTranslation
    ) {
      current = { speaker, language, isTranslation, tokens: [] };
      chunks.push(current);
    }

    current.tokens.push(token);
  }

  return chunks;
}

/**
 * Pair each `'original'` chunk with the immediately following translation
 * chunk for the same speaker, and emit a {@link TranslationSegment} for
 * every logical utterance.
 *
 * Soniox emits tokens in strict order: original chunk → translation chunk →
 * next original chunk → next translation chunk. So a chunk of
 * `translation_status: 'original'` tokens is always followed by its
 * translation when the same-speaker next chunk is a translation chunk.
 *
 * Chunks of `translation_status: 'none'` (third-language pass-through under
 * `between`) are never followed by a translation and stay standalone.
 */
function mergeChunks(chunks: RawChunk[]): TranslationSegment[] {
  const segments: TranslationSegment[] = [];

  let i = 0;
  while (i < chunks.length) {
    const chunk = chunks[i];
    if (!chunk) {
      i += 1;
      continue;
    }

    if (chunk.isTranslation) {
      // Translation chunk with no preceding original chunk to merge with
      // (e.g. dropped/missing original). Emit as-is.
      segments.push(buildSegmentFromChunks(undefined, chunk));
      i += 1;
      continue;
    }

    const firstStatus = chunk.tokens[0]?.translation_status;
    const next = chunks[i + 1];

    if (firstStatus === 'original' && next && next.isTranslation && next.speaker === chunk.speaker) {
      segments.push(buildSegmentFromChunks(chunk, next));
      i += 2;
      continue;
    }

    // 'none' chunk, or 'original' chunk without a following translation
    // (e.g. truncated stream).
    segments.push(buildSegmentFromChunks(chunk, undefined));
    i += 1;
  }

  return segments;
}

/**
 * Build a {@link TranslationSegment} from at most one original chunk and at
 * most one translation chunk. At least one must be provided.
 */
function buildSegmentFromChunks(original: RawChunk | undefined, translation: RawChunk | undefined): TranslationSegment {
  const original_tokens = original?.tokens ?? [];
  const translation_tokens = translation?.tokens ?? [];

  const speaker = original?.speaker ?? translation?.speaker;
  const from = resolveFrom(original_tokens, translation_tokens);
  const to = translation_tokens[0]?.language ?? undefined;

  const firstOriginal = original_tokens[0];
  const lastOriginal = original_tokens[original_tokens.length - 1];

  const original_text = original_tokens.reduce((acc, t) => acc + t.text, '');
  const translation_text = translation_tokens.reduce((acc, t) => acc + t.text, '');

  const segment: TranslationSegment = {
    from,
    original_text,
    original_tokens,
  };

  if (firstOriginal?.start_ms !== undefined) {
    segment.start_ms = firstOriginal.start_ms;
  }
  if (lastOriginal?.end_ms !== undefined) {
    segment.end_ms = lastOriginal.end_ms;
  }
  if (speaker !== undefined) {
    segment.speaker = speaker;
  }
  if (translation_tokens.length > 0) {
    if (to !== undefined) {
      segment.to = to;
    }
    segment.translation_text = translation_text;
    segment.translation_tokens = translation_tokens;
  }

  return segment;
}

/**
 * Resolve a segment's `from` (source language) field.
 *
 * Original tokens carry the source language in `language`; translation
 * tokens carry it in `source_language`. When neither is available we fall
 * back to an empty string so the field stays a `string`.
 */
function resolveFrom(originals: TranscriptToken[], translations: TranscriptToken[]): string {
  const fromOriginal = originals[0]?.language;
  if (fromOriginal !== undefined && fromOriginal !== null) {
    return fromOriginal;
  }
  const fromTranslation = translations[0]?.source_language;
  if (fromTranslation !== undefined && fromTranslation !== null) {
    return fromTranslation;
  }
  return '';
}

/**
 * Total audio duration in ms. Translation tokens carry no timestamps, so we
 * scan only original tokens (i.e. not `translation_status: 'translation'`).
 */
function computeDurationMs(tokens: TranscriptToken[]): number {
  let max = 0;
  for (const token of tokens) {
    if (token.translation_status === 'translation') continue;
    if (token.end_ms !== undefined && token.end_ms > max) {
      max = token.end_ms;
    }
  }
  return max;
}
