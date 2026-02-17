import { RealtimeUtteranceBuffer } from '@soniox/core';
import type { RealtimeResult, RealtimeToken } from '@soniox/core';

describe('RealtimeUtteranceBuffer', () => {
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

  it('should build utterance on endpoint', () => {
    const buffer = new RealtimeUtteranceBuffer();
    const tokens = [
      createToken('Hello', { start_ms: 0, end_ms: 500 }),
      createToken(' world', { start_ms: 500, end_ms: 1000 }),
    ];

    buffer.addResult(createResult(tokens, 1000));

    const utterance = buffer.markEndpoint();

    expect(utterance?.text).toBe('Hello world');
    expect(utterance?.segments).toHaveLength(1);
    expect(utterance?.tokens).toHaveLength(2);
    expect(utterance?.start_ms).toBe(0);
    expect(utterance?.end_ms).toBe(1000);
  });

  it('should include buffered tokens when no stable segments yet', () => {
    const buffer = new RealtimeUtteranceBuffer({ final_only: false });
    const tokens = [createToken('Hello', { is_final: false, start_ms: 0, end_ms: 200 })];

    buffer.addResult(createResult(tokens, 0));

    const utterance = buffer.markEndpoint();

    expect(utterance?.text).toBe('Hello');
    expect(utterance?.tokens).toHaveLength(1);
  });

  it('should accumulate same-speaker tokens into one segment across results', () => {
    const buffer = new RealtimeUtteranceBuffer();
    const result1 = createResult([createToken('Hi', { start_ms: 0, end_ms: 200 })], 200);
    const result2 = createResult([createToken(' there', { start_ms: 200, end_ms: 400 })], 400);

    buffer.addResult(result1);
    buffer.addResult(result2);

    const utterance = buffer.markEndpoint();

    expect(utterance?.text).toBe('Hi there');
    // Same speaker/language across both results → merged into one segment
    expect(utterance?.segments).toHaveLength(1);
  });

  it('should split segments at speaker boundaries across results', () => {
    const buffer = new RealtimeUtteranceBuffer({ group_by: ['speaker'] });
    const result1 = createResult([createToken('Hi', { speaker: '1', start_ms: 0, end_ms: 200 })], 200);
    const result2 = createResult([createToken(' there', { speaker: '2', start_ms: 200, end_ms: 400 })], 400);

    buffer.addResult(result1);
    buffer.addResult(result2);

    const utterance = buffer.markEndpoint();

    expect(utterance?.text).toBe('Hi there');
    expect(utterance?.segments).toHaveLength(2);
    expect(utterance?.segments[0]).toHaveProperty('text', 'Hi');
    expect(utterance?.segments[1]).toHaveProperty('text', ' there');
  });

  it('should return undefined when no pending segments', () => {
    const buffer = new RealtimeUtteranceBuffer();

    expect(buffer.markEndpoint()).toBeUndefined();
  });
});
