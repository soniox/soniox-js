import { segmentRealtimeTokens } from '../../../src/realtime/segments';
import type { RealtimeToken } from '../../../src/types/public/realtime';

describe('segmentRealtimeTokens', () => {
  const createToken = (text: string, overrides: Partial<RealtimeToken> = {}): RealtimeToken => ({
    text,
    confidence: 0.9,
    is_final: true,
    ...overrides,
  });

  it('should return empty array for empty tokens', () => {
    const result = segmentRealtimeTokens([]);
    expect(result).toEqual([]);
  });

  it('should group by speaker and language by default', () => {
    const tokens = [
      createToken('Hello', { start_ms: 0, end_ms: 500, speaker: '1', language: 'en' }),
      createToken(' world', { start_ms: 500, end_ms: 1000, speaker: '1', language: 'en' }),
      createToken('Hola', { start_ms: 1000, end_ms: 1200, speaker: '1', language: 'es' }),
    ];

    const result = segmentRealtimeTokens(tokens);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: 'Hello world', speaker: '1', language: 'en' });
    expect(result[0]?.start_ms).toBe(0);
    expect(result[0]?.end_ms).toBe(1000);
    expect(result[1]).toMatchObject({ text: 'Hola', speaker: '1', language: 'es' });
  });

  it('should support final_only filtering', () => {
    const tokens = [
      createToken('Hello', { is_final: false, speaker: '1' }),
      createToken(' world', { is_final: true, speaker: '1' }),
    ];

    const result = segmentRealtimeTokens(tokens, { final_only: true });

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(' world');
  });

  it('should honor group_by override', () => {
    const tokens = [
      createToken('Hello', { speaker: '1', language: 'en' }),
      createToken(' Hola', { speaker: '1', language: 'es' }),
      createToken('Hi', { speaker: '2', language: 'es' }),
    ];

    const result = segmentRealtimeTokens(tokens, { group_by: ['speaker'] });

    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('Hello Hola');
    expect(result[1]?.text).toBe('Hi');
  });
});
