import { SonioxUsageLogsAPI, UsageLogListResult } from '../../src/async/usage-logs';
import type { HttpClient } from '../../src/http';
import type {
  ListUsageLogsResponse,
  SonioxUsageLog,
  UsageSummaryEntry,
  UsageSummaryResponse,
} from '../../src/types/public';

const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

const createMockUsageLog = (overrides: Partial<SonioxUsageLog> = {}): SonioxUsageLog => ({
  uuid: '0d1e2f3a-4b5c-6d7e-8f90-1234567890ab',
  request_scope: 'api',
  client_reference_id: 'some_internal_id',
  model: 'stt-async-v3',
  start_time: '2026-04-28T09:00:00Z',
  end_time: '2026-04-28T09:00:12Z',
  input_text_tokens: 42,
  input_audio_tokens: 12345,
  input_audio_duration_ms: 12000,
  output_text_tokens: 678,
  output_audio_tokens: 256,
  output_audio_duration_ms: 4500,
  cost_usd: '0.0081000000',
  input_cost_usd: '0.0011000000',
  input_text_cost_usd: '0.0001000000',
  input_audio_cost_usd: '0.0010000000',
  output_cost_usd: '0.0070000000',
  output_text_cost_usd: '0.0050000000',
  output_audio_cost_usd: '0.0020000000',
  ...overrides,
});

const createMockUsageSummaryEntry = (overrides: Partial<UsageSummaryEntry> = {}): UsageSummaryEntry => ({
  model: null,
  days: ['2026-04-01', '2026-04-02'],
  total_cost_usd: '0.0200000000',
  total_input_cost_usd: '0.0050000000',
  total_output_cost_usd: '0.0150000000',
  total_duration_cost_usd: '0.0000000000',
  cost_usd: ['0.0100000000', '0.0100000000'],
  input_cost_usd: ['0.0025000000', '0.0025000000'],
  output_cost_usd: ['0.0075000000', '0.0075000000'],
  duration_cost_usd: ['0.0000000000', '0.0000000000'],
  total_num_requests: 4,
  total_input_text_tokens: 100,
  total_input_audio_tokens: 20000,
  total_input_audio_duration_ms: 24000,
  total_output_text_tokens: 800,
  total_output_audio_tokens: 0,
  total_output_audio_duration_ms: 0,
  total_duration_ms: 0,
  num_requests: [2, 2],
  input_text_tokens: [50, 50],
  input_audio_tokens: [10000, 10000],
  input_audio_duration_ms: [12000, 12000],
  output_text_tokens: [400, 400],
  output_audio_tokens: [0, 0],
  output_audio_duration_ms: [0, 0],
  duration_ms: [0, 0],
  ...overrides,
});

const createMockUsageSummary = (overrides: Partial<UsageSummaryResponse> = {}): UsageSummaryResponse => ({
  total: createMockUsageSummaryEntry({ model: null }),
  models: [createMockUsageSummaryEntry({ model: 'stt-async-v3' })],
  ...overrides,
});

describe('UsageLogListResult', () => {
  it('should expose first page data and helpers', () => {
    const response: ListUsageLogsResponse = {
      usage_logs: [createMockUsageLog({ uuid: 'log-1' })],
      next_page_cursor: 'next-cursor',
    };
    const mockHttp = createMockHttpClient();
    const result = new UsageLogListResult(response, mockHttp, {
      start_time: '2026-04-28T00:00:00Z',
      end_time: '2026-04-29T00:00:00Z',
    });

    expect(result.usage_logs).toEqual(response.usage_logs);
    expect(result.next_page_cursor).toBe('next-cursor');
    expect(result.isPaged()).toBe(true);
    expect(result.toJSON()).toEqual(response);
  });

  it('should return false from isPaged when there are no more pages', () => {
    const mockHttp = createMockHttpClient();
    const result = new UsageLogListResult(
      {
        usage_logs: [],
        next_page_cursor: null,
      },
      mockHttp,
      {
        start_time: '2026-04-28T00:00:00Z',
        end_time: '2026-04-29T00:00:00Z',
      }
    );

    expect(result.isPaged()).toBe(false);
  });

  it('should automatically fetch and yield usage logs from multiple pages', async () => {
    const requestMock = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          usage_logs: [createMockUsageLog({ uuid: 'log-3' })],
          next_page_cursor: 'cursor-2',
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          usage_logs: [createMockUsageLog({ uuid: 'log-4' })],
          next_page_cursor: null,
        },
      });
    const mockHttp = createMockHttpClient(requestMock);
    const options = {
      start_time: '2026-04-28T00:00:00Z',
      end_time: '2026-04-29T00:00:00Z',
      limit: 2,
      sort: 'end_time_desc' as const,
    };
    const result = new UsageLogListResult(
      {
        usage_logs: [createMockUsageLog({ uuid: 'log-1' }), createMockUsageLog({ uuid: 'log-2' })],
        next_page_cursor: 'cursor-1',
      },
      mockHttp,
      options
    );

    const usageLogs: SonioxUsageLog[] = [];
    for await (const usageLog of result) {
      usageLogs.push(usageLog);
    }

    expect(usageLogs.map((log) => log.uuid)).toEqual(['log-1', 'log-2', 'log-3', 'log-4']);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/v1/usage-logs',
      query: {
        start_time: '2026-04-28T00:00:00Z',
        end_time: '2026-04-29T00:00:00Z',
        limit: 2,
        sort: 'end_time_desc',
        cursor: 'cursor-1',
      },
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/v1/usage-logs',
      query: {
        start_time: '2026-04-28T00:00:00Z',
        end_time: '2026-04-29T00:00:00Z',
        limit: 2,
        sort: 'end_time_desc',
        cursor: 'cursor-2',
      },
    });
  });
});

describe('SonioxUsageLogsAPI', () => {
  describe('list()', () => {
    it('should make GET request to /v1/usage-logs with required query params', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {
          usage_logs: [createMockUsageLog()],
          next_page_cursor: null,
        },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);

      const result = await api.list({
        start_time: '2026-04-28T00:00:00Z',
        end_time: '2026-04-29T00:00:00Z',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/usage-logs',
        query: {
          start_time: '2026-04-28T00:00:00Z',
          end_time: '2026-04-29T00:00:00Z',
          limit: undefined,
          sort: undefined,
          cursor: undefined,
        },
      });
      expect(result).toBeInstanceOf(UsageLogListResult);
      expect(result.usage_logs).toHaveLength(1);
    });

    it('should pass optional limit, sort, cursor, and signal', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { usage_logs: [], next_page_cursor: null },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);
      const controller = new AbortController();

      await api.list({
        start_time: '2026-04-28T00:00:00Z',
        end_time: '2026-04-29T00:00:00Z',
        limit: 50,
        sort: 'end_time_desc',
        cursor: 'my-cursor',
        signal: controller.signal,
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/usage-logs',
        query: {
          start_time: '2026-04-28T00:00:00Z',
          end_time: '2026-04-29T00:00:00Z',
          limit: 50,
          sort: 'end_time_desc',
          cursor: 'my-cursor',
        },
        signal: controller.signal,
      });
    });

    it('should propagate HTTP errors', async () => {
      const requestMock = jest.fn().mockRejectedValue(new Error('Network error'));
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);

      await expect(
        api.list({
          start_time: '2026-04-28T00:00:00Z',
          end_time: '2026-04-29T00:00:00Z',
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('getSummary()', () => {
    it('should make GET request to /v1/usage/summary with required query params', async () => {
      const summary = createMockUsageSummary();
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: summary,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);

      const result = await api.getSummary({
        start_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-03T00:00:00Z',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/usage/summary',
        query: {
          start_time: '2026-04-01T00:00:00Z',
          end_time: '2026-04-03T00:00:00Z',
        },
      });
      expect(result).toEqual(summary);
      expect(result.total.model).toBeNull();
      expect(result.models[0]?.model).toBe('stt-async-v3');
    });

    it('should pass abort signal', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockUsageSummary(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);
      const controller = new AbortController();

      await api.getSummary({
        start_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-03T00:00:00Z',
        signal: controller.signal,
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/usage/summary',
        query: {
          start_time: '2026-04-01T00:00:00Z',
          end_time: '2026-04-03T00:00:00Z',
        },
        signal: controller.signal,
      });
    });

    it('should handle a window with no usage', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockUsageSummary({
          total: createMockUsageSummaryEntry({
            total_cost_usd: '0.0000000000',
            total_num_requests: 0,
            num_requests: [0, 0],
          }),
          models: [],
        }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);

      const result = await api.getSummary({
        start_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-03T00:00:00Z',
      });

      expect(result.models).toEqual([]);
      expect(result.total.total_num_requests).toBe(0);
      expect(result.total.days).toHaveLength(2);
    });

    it('should propagate HTTP errors', async () => {
      const requestMock = jest.fn().mockRejectedValue(new Error('Network error'));
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxUsageLogsAPI(mockHttp);

      await expect(
        api.getSummary({
          start_time: '2026-04-01T00:00:00Z',
          end_time: '2026-04-03T00:00:00Z',
        })
      ).rejects.toThrow('Network error');
    });
  });
});
