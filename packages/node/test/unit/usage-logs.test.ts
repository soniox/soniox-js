import { SonioxUsageLogsAPI, UsageLogListResult } from '../../src/async/usage-logs';
import type { HttpClient } from '../../src/http';
import type { ListUsageLogsResponse, SonioxUsageLog } from '../../src/types/public';

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
});
