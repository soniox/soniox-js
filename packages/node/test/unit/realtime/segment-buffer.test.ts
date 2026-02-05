import { RealtimeSegmentBuffer } from '../../../src/realtime/segment-buffer';
import type { RealtimeResult, RealtimeToken } from '../../../src/types/public/realtime';

describe('RealtimeSegmentBuffer', () => {
  const createToken = (
    text: string,
    overrides: Partial<RealtimeToken> = {}
  ): RealtimeToken => ({
    text,
    confidence: 0.9,
    is_final: true,
    ...overrides,
  });

  const createResult = (tokens: RealtimeToken[], final_audio_proc_ms = 0): RealtimeResult => ({
    tokens,
    final_audio_proc_ms,
    total_audio_proc_ms: final_audio_proc_ms,
  });

  it('should return stable segments and keep remainder buffered', () => {
    const buffer = new RealtimeSegmentBuffer({ group_by: ['speaker'] });
    const tokens = [
      createToken('Hello', { speaker: '1', start_ms: 0, end_ms: 100 }),
      createToken('Hi', { speaker: '2', start_ms: 100, end_ms: 200 }),
    ];

    const segments = buffer.add(createResult(tokens, 150));

    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveProperty('text', 'Hello');
    expect(buffer.size).toBe(1);
  });

  it('should ignore non-final tokens by default', () => {
    const buffer = new RealtimeSegmentBuffer();
    const tokens = [createToken('Hello', { is_final: false })];

    const segments = buffer.add(createResult(tokens, 0));

    expect(segments).toHaveLength(0);
    expect(buffer.size).toBe(0);
  });

  it('should trim to max_tokens', () => {
    const buffer = new RealtimeSegmentBuffer({ max_tokens: 2, final_only: false });
    const tokens = [
      createToken('A', { end_ms: 10 }),
      createToken('B', { end_ms: 20 }),
      createToken('C', { end_ms: 30 }),
    ];

    buffer.add(createResult(tokens, 0));

    expect(buffer.size).toBe(2);
  });

  it('should reset buffer', () => {
    const buffer = new RealtimeSegmentBuffer({ final_only: false });
    const tokens = [createToken('Hello', { end_ms: 10 })];

    buffer.add(createResult(tokens, 0));
    expect(buffer.size).toBe(1);

    buffer.reset();
    expect(buffer.size).toBe(0);
  });

  it('should flush all buffered tokens into segments', () => {
    const buffer = new RealtimeSegmentBuffer({ group_by: ['speaker'], final_only: false });
    const tokens = [
      createToken('Hello', { speaker: '1', start_ms: 0, end_ms: 100 }),
      createToken('Hi', { speaker: '2', start_ms: 100, end_ms: 200 }),
    ];

    buffer.add(createResult(tokens, 0));

    const segments = buffer.flushAll();

    expect(segments).toHaveLength(2);
    expect(buffer.size).toBe(0);
  });
});
