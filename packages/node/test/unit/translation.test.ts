import { translateFromTranscript } from '../../src/async/translation';
import type { TranscriptToken } from '../../src/types/public';

type TokenInit = Partial<TranscriptToken> & Pick<TranscriptToken, 'text'>;

const token = (init: TokenInit): TranscriptToken => ({
  confidence: 0.95,
  ...init,
});

const original = (
  text: string,
  language: string,
  start_ms: number,
  end_ms: number,
  extra: Partial<TranscriptToken> = {}
): TranscriptToken =>
  token({
    text,
    language,
    start_ms,
    end_ms,
    translation_status: 'original',
    ...extra,
  });

const noneToken = (
  text: string,
  language: string,
  start_ms: number,
  end_ms: number,
  extra: Partial<TranscriptToken> = {}
): TranscriptToken =>
  token({
    text,
    language,
    start_ms,
    end_ms,
    translation_status: 'none',
    ...extra,
  });

const translation = (
  text: string,
  source_language: string,
  language: string,
  extra: Partial<TranscriptToken> = {}
): TranscriptToken =>
  token({
    text,
    source_language,
    language,
    translation_status: 'translation',
    ...extra,
  });

describe('translateFromTranscript', () => {
  describe('one_way', () => {
    it('returns an empty result for an empty transcript', () => {
      const result = translateFromTranscript({ tokens: [] }, { type: 'one_way', to: 'es' });

      expect(result).toEqual({
        mode: 'one_way',
        to: 'es',
        duration_ms: 0,
        segments: [],
        original_text: '',
        translation_text: '',
      });
    });

    it('omits `from` when only `to` is provided', () => {
      const tokens = [original('Hello', 'en', 0, 500), translation(' Hola', 'en', 'es')];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es' });

      expect(result.mode).toBe('one_way');
      if (result.mode !== 'one_way') return;
      expect(result.to).toBe('es');
      expect(result).not.toHaveProperty('from');
      expect(result.translation_text).toBe(' Hola');
      expect(result.original_text).toBe('Hello');
    });

    it('reshapes a single english utterance into one segment with both halves', () => {
      const tokens = [
        original('Hello', 'en', 0, 500),
        original(' world', 'en', 500, 1000),
        translation(' Hola', 'en', 'es'),
        translation(' mundo', 'en', 'es'),
      ];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es', from: 'en' });

      expect(result.mode).toBe('one_way');
      if (result.mode !== 'one_way') throw new Error('expected one_way');

      expect(result.from).toBe('en');
      expect(result.to).toBe('es');
      expect(result.duration_ms).toBe(1000);
      expect(result.original_text).toBe('Hello world');
      expect(result.translation_text).toBe(' Hola mundo');
      expect(result.segments).toHaveLength(1);

      const seg = result.segments[0];
      if (!seg) throw new Error('expected segment');
      expect(seg.from).toBe('en');
      expect(seg.to).toBe('es');
      expect(seg.start_ms).toBe(0);
      expect(seg.end_ms).toBe(1000);
      expect(seg.original_text).toBe('Hello world');
      expect(seg.translation_text).toBe(' Hola mundo');
      expect(seg.original_tokens).toHaveLength(2);
      expect(seg.translation_tokens).toHaveLength(2);
      expect(seg.speaker).toBeUndefined();
    });

    it('keeps speaker on each segment when diarization is enabled', () => {
      const tokens = [
        original('Hi', 'en', 0, 200, { speaker: '1' }),
        translation(' Hola', 'en', 'es', { speaker: '1' }),
        original('Bye', 'en', 300, 500, { speaker: '2' }),
        translation(' Adios', 'en', 'es', { speaker: '2' }),
      ];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es', from: 'en' });
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]?.speaker).toBe('1');
      expect(result.segments[1]?.speaker).toBe('2');
    });

    it('produces multiple segments when source language changes mid-stream', () => {
      const tokens = [
        original('Hello', 'en', 0, 500),
        translation(' Hola', 'en', 'es'),
        original('Bonjour', 'fr', 500, 1000),
        translation(' Hola', 'fr', 'es'),
      ];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es' });
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]?.from).toBe('en');
      expect(result.segments[1]?.from).toBe('fr');
      expect(result.original_text).toBe('HelloBonjour');
      expect(result.translation_text).toBe(' Hola Hola');
    });

    it('merges originals with their translations even when translation tokens are missing source_language', () => {
      // The async API does not always populate `source_language` on
      // translation tokens. Merging must still pair them with their preceding
      // original chunk (same speaker, status 'original') based on emission
      // order alone.
      const tokens = [
        token({
          text: 'Hello',
          start_ms: 0,
          end_ms: 500,
          language: 'en',
          translation_status: 'original',
          speaker: '1',
        }),
        token({
          text: ' Hola',
          language: 'es',
          translation_status: 'translation',
          speaker: '1',
          // Note: no source_language field on purpose.
        }),
      ];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es' });

      expect(result.segments).toHaveLength(1);
      const seg = result.segments[0];
      if (!seg) throw new Error('expected segment');
      expect(seg.from).toBe('en');
      expect(seg.to).toBe('es');
      expect(seg.original_text).toBe('Hello');
      expect(seg.translation_text).toBe(' Hola');
    });

    it('handles transcripts with no translation tokens', () => {
      const tokens = [original('Hello', 'en', 0, 500), original(' world', 'en', 500, 1000)];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es', from: 'en' });

      expect(result.segments).toHaveLength(1);
      const seg = result.segments[0];
      if (!seg) throw new Error('expected segment');
      expect(seg.original_text).toBe('Hello world');
      expect(seg).not.toHaveProperty('translation_text');
      expect(seg).not.toHaveProperty('to');
      expect(result.translation_text).toBe('');
    });
  });

  describe('two_way', () => {
    it('reshapes a back-and-forth conversation', () => {
      const tokens = [
        original('Hello', 'en', 0, 500, { speaker: '1' }),
        translation(' Hola', 'en', 'es', { speaker: '1' }),
        original('¿Cómo estás?', 'es', 500, 1000, { speaker: '2' }),
        translation(' How are you?', 'es', 'en', { speaker: '2' }),
      ];

      const result = translateFromTranscript(
        { tokens },
        {
          type: 'two_way',
          language_a: 'en',
          language_b: 'es',
        }
      );

      expect(result.mode).toBe('two_way');
      if (result.mode !== 'two_way') throw new Error('expected two_way');
      expect(result.language_a).toBe('en');
      expect(result.language_b).toBe('es');
      expect(result.duration_ms).toBe(1000);
      expect(result).not.toHaveProperty('original_text');
      expect(result).not.toHaveProperty('translation_text');
      expect(result.segments).toHaveLength(2);

      expect(result.segments[0]).toMatchObject({
        speaker: '1',
        from: 'en',
        to: 'es',
        original_text: 'Hello',
        translation_text: ' Hola',
      });
      expect(result.segments[1]).toMatchObject({
        speaker: '2',
        from: 'es',
        to: 'en',
        original_text: '¿Cómo estás?',
        translation_text: ' How are you?',
      });
    });

    it('emits third-language pass-through segments without `to` or translation fields', () => {
      const tokens = [
        original('Hello', 'en', 0, 500, { speaker: '1' }),
        translation(' Hola', 'en', 'es', { speaker: '1' }),
        noneToken('Bonjour', 'fr', 500, 1000, { speaker: '2' }),
      ];

      const result = translateFromTranscript(
        { tokens },
        {
          type: 'two_way',
          language_a: 'en',
          language_b: 'es',
        }
      );

      expect(result.segments).toHaveLength(2);

      const passthrough = result.segments[1];
      if (!passthrough) throw new Error('expected passthrough segment');
      expect(passthrough.speaker).toBe('2');
      expect(passthrough.from).toBe('fr');
      expect(passthrough).not.toHaveProperty('to');
      expect(passthrough).not.toHaveProperty('translation_text');
      expect(passthrough).not.toHaveProperty('translation_tokens');
      expect(passthrough.original_text).toBe('Bonjour');
    });

    it('works without speaker diarization', () => {
      const tokens = [
        original('Hello', 'en', 0, 500),
        translation(' Hola', 'en', 'es'),
        original('Adios', 'es', 500, 1000),
        translation(' Bye', 'es', 'en'),
      ];

      const result = translateFromTranscript(
        { tokens },
        {
          type: 'two_way',
          language_a: 'en',
          language_b: 'es',
        }
      );

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]?.speaker).toBeUndefined();
      expect(result.segments[1]?.speaker).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('omits start_ms / end_ms on translation-only segments (no preceding original chunk)', () => {
      const tokens = [translation(' Hola', 'en', 'es')];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es' });

      expect(result.segments).toHaveLength(1);
      const seg = result.segments[0];
      if (!seg) throw new Error('expected segment');
      expect(seg.from).toBe('en');
      expect(seg.to).toBe('es');
      expect(seg.translation_text).toBe(' Hola');
      expect(seg.original_text).toBe('');
      expect(seg).not.toHaveProperty('start_ms');
      expect(seg).not.toHaveProperty('end_ms');
    });

    it('duration_ms ignores translation tokens (which carry no timestamps)', () => {
      const tokens = [original('Hi', 'en', 1000, 2500), translation(' Hola', 'en', 'es')];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es' });
      expect(result.duration_ms).toBe(2500);
    });
  });

  describe('JSON serialisation', () => {
    it('survives a JSON round-trip with no class instances or methods', () => {
      const tokens = [original('Hello', 'en', 0, 500), translation(' Hola', 'en', 'es')];

      const result = translateFromTranscript({ tokens }, { type: 'one_way', to: 'es' });
      const roundTripped = JSON.parse(JSON.stringify(result));
      expect(roundTripped).toEqual(result);
    });
  });
});
