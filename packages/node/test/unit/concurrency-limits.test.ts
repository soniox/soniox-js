import { SonioxConcurrencyLimitsAPI } from '../../src/async/concurrency-limits';
import type { HttpClient } from '../../src/http';
import type { ConcurrencyLimitsResponse, ConcurrentStreamsHistoryResponse } from '../../src/types/public';

const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

const createMockConcurrencyLimits = (
  overrides: Partial<ConcurrencyLimitsResponse> = {}
): ConcurrencyLimitsResponse => ({
  project: {
    current: {
      transcribe_concurrent: 2,
      tts_concurrent: 0,
    },
    limits: {
      transcribe_concurrent: 4,
      tts_concurrent: 1,
    },
  },
  organization: {
    current: {
      transcribe_concurrent: 5,
      tts_concurrent: 1,
    },
    limits: {
      transcribe_concurrent: 10,
      tts_concurrent: 2,
    },
  },
  ...overrides,
});

const createMockConcurrentStreamsHistory = (
  overrides: Partial<ConcurrentStreamsHistoryResponse> = {}
): ConcurrentStreamsHistoryResponse => ({
  kind: 'stt',
  entries: [
    {
      period_start: '2026-04-28T09:00:00Z',
      period_sec: 60,
      sample_min: 0,
      sample_max: 3,
      sample_sum: 12,
      sample_count: 8,
      total_count: 1,
    },
  ],
  ...overrides,
});

describe('SonioxConcurrencyLimitsAPI', () => {
  describe('get()', () => {
    it('should make GET request to /v1/concurrency-limits', async () => {
      const mockLimits = createMockConcurrencyLimits();
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: mockLimits,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);

      const result = await api.get();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/concurrency-limits',
      });
      expect(result).toEqual(mockLimits);
    });

    it('should support nullable configured limits', async () => {
      const mockLimits = createMockConcurrencyLimits({
        project: {
          current: {
            transcribe_concurrent: 0,
            tts_concurrent: 0,
          },
          limits: {
            transcribe_concurrent: null,
            tts_concurrent: null,
          },
        },
      });
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: mockLimits,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);

      const result = await api.get();

      expect(result.project.limits.transcribe_concurrent).toBeNull();
      expect(result.project.limits.tts_concurrent).toBeNull();
    });

    it('should pass abort signal', async () => {
      const mockLimits = createMockConcurrencyLimits();
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: mockLimits,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);
      const controller = new AbortController();

      await api.get(controller.signal);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/concurrency-limits',
        signal: controller.signal,
      });
    });

    it('should propagate HTTP errors', async () => {
      const requestMock = jest.fn().mockRejectedValue(new Error('Network error'));
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);

      await expect(api.get()).rejects.toThrow('Network error');
    });
  });

  describe('getHistory()', () => {
    it('should make GET request to /v1/concurrent-streams-history with required query params', async () => {
      const history = createMockConcurrentStreamsHistory();
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: history,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);

      const result = await api.getHistory({
        start_time: '2026-04-28T09:00:00Z',
        end_time: '2026-04-28T10:00:00Z',
        period_sec: 60,
        kind: 'stt',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/concurrent-streams-history',
        query: {
          start_time: '2026-04-28T09:00:00Z',
          end_time: '2026-04-28T10:00:00Z',
          period_sec: 60,
          kind: 'stt',
        },
      });
      expect(result).toEqual(history);
      expect(result.entries[0]?.sample_max).toBe(3);
    });

    it('should pass abort signal and support tts kind / hourly period', async () => {
      const history = createMockConcurrentStreamsHistory({
        kind: 'tts',
        entries: [
          {
            period_start: '2026-04-28T09:00:00Z',
            period_sec: 3600,
            sample_min: 0,
            sample_max: 1,
            sample_sum: 10,
            sample_count: 20,
            total_count: 60,
          },
        ],
      });
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: history,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);
      const controller = new AbortController();

      const result = await api.getHistory({
        start_time: '2026-04-28T09:00:00Z',
        end_time: '2026-04-28T12:00:00Z',
        period_sec: 3600,
        kind: 'tts',
        signal: controller.signal,
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/concurrent-streams-history',
        query: {
          start_time: '2026-04-28T09:00:00Z',
          end_time: '2026-04-28T12:00:00Z',
          period_sec: 3600,
          kind: 'tts',
        },
        signal: controller.signal,
      });
      expect(result.kind).toBe('tts');
    });

    it('should return zeroed entries for periods with no activity', async () => {
      const idlePeriod = {
        period_start: '2026-04-28T09:01:00Z',
        period_sec: 60,
        sample_min: 0,
        sample_max: 0,
        sample_sum: 0,
        sample_count: 0,
        total_count: 0,
      };
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockConcurrentStreamsHistory({ entries: [idlePeriod] }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);

      const result = await api.getHistory({
        start_time: '2026-04-28T09:01:00Z',
        end_time: '2026-04-28T09:02:00Z',
        period_sec: 60,
        kind: 'stt',
      });

      expect(result.entries).toEqual([idlePeriod]);
    });

    it('should propagate HTTP errors', async () => {
      const requestMock = jest.fn().mockRejectedValue(new Error('Network error'));
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxConcurrencyLimitsAPI(mockHttp);

      await expect(
        api.getHistory({
          start_time: '2026-04-28T09:00:00Z',
          end_time: '2026-04-28T10:00:00Z',
          period_sec: 60,
          kind: 'stt',
        })
      ).rejects.toThrow('Network error');
    });
  });
});
