import { RealtimeSegmentBuffer } from '@soniox/core';
import type { RealtimeResult, RealtimeToken } from '@soniox/core';

describe('RealtimeSegmentBuffer', () => {
  const createToken = (text: string, overrides: Partial<RealtimeToken> = {}): RealtimeToken => ({
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

  it('should not flush the trailing segment for a single speaker', () => {
    const buffer = new RealtimeSegmentBuffer({ group_by: ['speaker'] });
    const tokens = [
      createToken('Hello', { speaker: '1', start_ms: 0, end_ms: 100 }),
      createToken(' world', { speaker: '1', start_ms: 100, end_ms: 200 }),
    ];

    const segments = buffer.add(createResult(tokens, 200));

    expect(segments).toHaveLength(0);
    expect(buffer.size).toBe(2);
  });

  it('should flush trailing segment via flushAll', () => {
    const buffer = new RealtimeSegmentBuffer({ group_by: ['speaker'] });
    const tokens = [
      createToken('Hello', { speaker: '1', start_ms: 0, end_ms: 100 }),
      createToken(' world', { speaker: '1', start_ms: 100, end_ms: 200 }),
    ];

    buffer.add(createResult(tokens, 200));
    const segments = buffer.flushAll();

    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveProperty('text', 'Hello world');
    expect(buffer.size).toBe(0);
  });

  it('should flush completed speaker segments when a new speaker follows', () => {
    const buffer = new RealtimeSegmentBuffer({ group_by: ['speaker'] });

    // First result: speaker 1 only (trailing, not flushed)
    const seg1 = buffer.add(createResult([createToken('Hello', { speaker: '1', start_ms: 0, end_ms: 100 })], 100));
    expect(seg1).toHaveLength(0);

    // Second result: speaker 2 arrives, so speaker 1 segment is complete
    const seg2 = buffer.add(createResult([createToken('Hi', { speaker: '2', start_ms: 100, end_ms: 200 })], 200));
    expect(seg2).toHaveLength(1);
    expect(seg2[0]).toHaveProperty('text', 'Hello');
    expect(buffer.size).toBe(1); // speaker 2 token still buffered
  });

  it('should merge same-speaker tokens across multiple results', () => {
    const buffer = new RealtimeSegmentBuffer({ group_by: ['speaker'] });

    buffer.add(createResult([createToken('I can tal', { speaker: '1', start_ms: 0, end_ms: 300 })], 300));
    buffer.add(createResult([createToken('k really slowly', { speaker: '1', start_ms: 300, end_ms: 600 })], 600));

    // No segments flushed yet (same speaker, trailing)
    expect(buffer.size).toBe(2);

    // flushAll merges into a single segment
    const segments = buffer.flushAll();
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveProperty('text', 'I can talk really slowly');
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
