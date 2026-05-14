import { SonioxConcurrencyLimitsAPI } from '../../src/async/concurrency-limits';
import type { HttpClient } from '../../src/http';
import type { ConcurrencyLimitsResponse } from '../../src/types/public';

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
});
