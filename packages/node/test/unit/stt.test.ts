import {
  segmentTranscript,
  SonioxTranscript,
  SonioxTranscription,
  SonioxSttApi,
  TranscriptionListResult,
} from '../../src/async/stt';
import { SonioxFile, SonioxFilesAPI } from '../../src/async/files';
import { SonioxHttpError } from '../../src/http/errors';
import type { HttpClient } from '../../src/http';
import type {
  ListTranscriptionsResponse,
  SonioxTranscriptionData,
  TranscribeOptions,
  TranscriptToken,
  SonioxFileData,
} from '../../src/types/public';

// Helper to create a mock 404 error
const createMock404Error = () =>
  new SonioxHttpError({
    code: 'http_error',
    message: 'HTTP 404',
    url: 'https://api.soniox.com/v1/transcriptions/test',
    method: 'GET',
    statusCode: 404,
    headers: {},
    bodyText: 'Not found',
  });

// Helper to create mock transcription data
const createMockTranscriptionData = (overrides: Partial<SonioxTranscriptionData> = {}): SonioxTranscriptionData => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'queued',
  model: 'stt-async-v4',
  created_at: '2024-11-26T00:00:00Z',
  filename: 'test-audio.mp3',
  enable_speaker_diarization: false,
  enable_language_identification: false,
  ...overrides,
});

// Helper to create a mock HttpClient
const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

// Helper to create a mock FilesAPI
const createMockFilesAPI = (uploadMock: jest.Mock = jest.fn()): SonioxFilesAPI => {
  const mockHttp = createMockHttpClient();
  const api = new SonioxFilesAPI(mockHttp);
  api.upload = uploadMock;
  return api;
};

describe('SonioxTranscription', () => {
  describe('delete()', () => {
    it('should call DELETE on the correct endpoint', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 204,
        headers: {},
        data: null,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);

      await transcription.delete();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('should succeed silently on 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);

      await expect(transcription.delete()).resolves.toBeUndefined();
    });
  });

  describe('destroy()', () => {
    it('should delete transcription and file when file_id exists', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 204,
        headers: {},
        data: null,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ file_id: 'file-123' }), mockHttp);

      await transcription.destroy();

      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock).toHaveBeenNthCalledWith(1, {
        method: 'DELETE',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
      });
      expect(requestMock).toHaveBeenNthCalledWith(2, {
        method: 'DELETE',
        path: '/v1/files/file-123',
      });
    });

    it('should only delete transcription when no file_id', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 204,
        headers: {},
        data: null,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(
        createMockTranscriptionData({ audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3' }),
        mockHttp
      );

      await transcription.destroy();

      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('should succeed when transcription returns 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ file_id: 'file-123' }), mockHttp);

      // Should not throw, and should still try to delete file
      await expect(transcription.destroy()).resolves.toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it('should succeed when file returns 404 (idempotent)', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null })
        .mockRejectedValueOnce(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ file_id: 'file-123' }), mockHttp);

      await expect(transcription.destroy()).resolves.toBeUndefined();
    });
  });

  describe('refresh()', () => {
    it('should fetch and return a new transcription instance', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockTranscriptionData({ status: 'completed' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'processing' }), mockHttp);

      const refreshed = await transcription.refresh();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
      });
      expect(refreshed).toBeInstanceOf(SonioxTranscription);
      expect(refreshed.status).toBe('completed');
      expect(refreshed).not.toBe(transcription);
    });
  });

  describe('getTranscript()', () => {
    it('should fetch transcript from correct endpoint and return SonioxTranscript', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { id: 'trans-id', text: 'Hello world', tokens: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);

      const transcript = await transcription.getTranscript();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000/transcript',
      });
      expect(transcript).toBeInstanceOf(SonioxTranscript);
      expect(transcript?.text).toBe('Hello world');
    });

    it('should return null on 404', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);

      const transcript = await transcription.getTranscript();

      expect(transcript).toBeNull();
    });

    it('should return cached transcript without making HTTP request', async () => {
      const requestMock = jest.fn();
      const mockHttp = createMockHttpClient(requestMock);
      const cachedTranscript = new SonioxTranscript({ id: 'trans-id', text: 'Cached text', tokens: [] });
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp, cachedTranscript);

      const transcript = await transcription.getTranscript();

      expect(requestMock).not.toHaveBeenCalled();
      expect(transcript).toBe(cachedTranscript);
      expect(transcript?.text).toBe('Cached text');
    });

    it('should return null without making HTTP request when cached transcript is null', async () => {
      const requestMock = jest.fn();
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp, null);

      const transcript = await transcription.getTranscript();

      expect(requestMock).not.toHaveBeenCalled();
      expect(transcript).toBeNull();
    });

    it('should make HTTP request when transcript is undefined', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { id: 'trans-id', text: 'Fetched text', tokens: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);

      const transcript = await transcription.getTranscript();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000/transcript',
      });
      expect(transcript?.text).toBe('Fetched text');
    });

    it('should bypass cache and make HTTP request when force is true', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { id: 'trans-id', text: 'Fresh text', tokens: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const cachedTranscript = new SonioxTranscript({ id: 'trans-id', text: 'Cached text', tokens: [] });
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp, cachedTranscript);

      const transcript = await transcription.getTranscript({ force: true });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000/transcript',
      });
      expect(transcript?.text).toBe('Fresh text');
    });

    it('should pass signal option to HTTP request', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { id: 'trans-id', text: 'Hello world', tokens: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);
      const controller = new AbortController();

      await transcription.getTranscript({ signal: controller.signal });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000/transcript',
        signal: controller.signal,
      });
    });
  });

  describe('wait()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return immediately if already completed', async () => {
      const mockHttp = createMockHttpClient();
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'completed' }), mockHttp);

      const result = await transcription.wait();

      expect(result).toBe(transcription);
    });

    it('should return immediately if already errored', async () => {
      const mockHttp = createMockHttpClient();
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'error' }), mockHttp);

      const result = await transcription.wait();

      expect(result).toBe(transcription);
    });

    it('should poll until completed', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'processing' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'queued' }), mockHttp);

      const waitPromise = transcription.wait({ interval_ms: 1000 });

      // First refresh returns processing
      await jest.advanceTimersByTimeAsync(1000);
      // Second refresh returns completed
      await jest.advanceTimersByTimeAsync(1000);

      const result = await waitPromise;

      expect(result.status).toBe('completed');
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it('should enforce minimum polling interval of 1000ms', async () => {
      const requestMock = jest.fn().mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: createMockTranscriptionData({ status: 'completed' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'queued' }), mockHttp);

      const waitPromise = transcription.wait({ interval_ms: 100 }); // Below minimum

      // Should use 1000ms instead of 100ms
      await jest.advanceTimersByTimeAsync(1000);

      await waitPromise;

      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should call on_status_change callback when status changes', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'processing' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'queued' }), mockHttp);
      const onStatusChange = jest.fn();

      const waitPromise = transcription.wait({
        interval_ms: 1000,
        on_status_change: onStatusChange,
      });

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);

      await waitPromise;

      expect(onStatusChange).toHaveBeenCalledTimes(2);
      expect(onStatusChange).toHaveBeenNthCalledWith(
        1,
        'processing',
        expect.objectContaining({ status: 'processing' })
      );
      expect(onStatusChange).toHaveBeenNthCalledWith(2, 'completed', expect.objectContaining({ status: 'completed' }));
    });

    it('should throw on timeout', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockTranscriptionData({ status: 'processing' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'queued' }), mockHttp);

      const waitPromise = transcription.wait({
        interval_ms: 1000,
        timeout_ms: 2500,
      });

      // Set up the rejection expectation before advancing timers
      const expectPromise = expect(waitPromise).rejects.toThrow('Transcription wait timed out after 2500ms');

      // Advance past timeout
      await jest.advanceTimersByTimeAsync(3000);

      await expectPromise;
    });

    it('should throw when aborted', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockTranscriptionData({ status: 'processing' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const transcription = new SonioxTranscription(createMockTranscriptionData({ status: 'queued' }), mockHttp);
      const controller = new AbortController();

      const waitPromise = transcription.wait({
        interval_ms: 1000,
        signal: controller.signal,
      });

      // Set up the rejection expectation before advancing timers
      const expectPromise = expect(waitPromise).rejects.toThrow('Transcription wait aborted');

      await jest.advanceTimersByTimeAsync(1000);
      controller.abort();
      await jest.advanceTimersByTimeAsync(1000);

      await expectPromise;
    });
  });
});

describe('TranscriptionListResult', () => {
  it('should create result with transcriptions from initial response', () => {
    const mockHttp = createMockHttpClient();
    const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
      transcriptions: [createMockTranscriptionData({ id: 'trans-1' }), createMockTranscriptionData({ id: 'trans-2' })],
      next_page_cursor: null,
    };

    const result = new TranscriptionListResult(response, mockHttp, {});

    expect(result.transcriptions).toHaveLength(2);
    expect(result.transcriptions[0]?.id).toBe('trans-1');
    expect(result.transcriptions[1]?.id).toBe('trans-2');
    expect(result.next_page_cursor).toBeNull();
  });

  describe('isPaged()', () => {
    it('should return false when next_page_cursor is null', () => {
      const mockHttp = createMockHttpClient();
      const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
        transcriptions: [],
        next_page_cursor: null,
      };

      const result = new TranscriptionListResult(response, mockHttp, {});

      expect(result.isPaged()).toBe(false);
    });

    it('should return true when next_page_cursor exists', () => {
      const mockHttp = createMockHttpClient();
      const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
        transcriptions: [],
        next_page_cursor: 'cursor-abc',
      };

      const result = new TranscriptionListResult(response, mockHttp, {});

      expect(result.isPaged()).toBe(true);
    });
  });

  describe('async iteration', () => {
    it('should yield all transcriptions from single page', async () => {
      const mockHttp = createMockHttpClient();
      const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
        transcriptions: [
          createMockTranscriptionData({ id: 'trans-1' }),
          createMockTranscriptionData({ id: 'trans-2' }),
        ],
        next_page_cursor: null,
      };

      const result = new TranscriptionListResult(response, mockHttp, {});
      const transcriptions: SonioxTranscription[] = [];

      for await (const t of result) {
        transcriptions.push(t);
      }

      expect(transcriptions).toHaveLength(2);
      expect(transcriptions[0]?.id).toBe('trans-1');
      expect(transcriptions[1]?.id).toBe('trans-2');
    });

    it('should automatically fetch and yield transcriptions from multiple pages', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            transcriptions: [createMockTranscriptionData({ id: 'trans-3' })],
            next_page_cursor: 'cursor-page-3',
          },
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            transcriptions: [createMockTranscriptionData({ id: 'trans-4' })],
            next_page_cursor: null,
          },
        });

      const mockHttp = createMockHttpClient(requestMock);
      const initialResponse: ListTranscriptionsResponse<SonioxTranscriptionData> = {
        transcriptions: [
          createMockTranscriptionData({ id: 'trans-1' }),
          createMockTranscriptionData({ id: 'trans-2' }),
        ],
        next_page_cursor: 'cursor-page-2',
      };

      const result = new TranscriptionListResult(initialResponse, mockHttp, { limit: 10 });
      const transcriptions: SonioxTranscription[] = [];

      for await (const t of result) {
        transcriptions.push(t);
      }

      expect(transcriptions).toHaveLength(4);
      expect(transcriptions.map((t) => t.id)).toEqual(['trans-1', 'trans-2', 'trans-3', 'trans-4']);

      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/v1/transcriptions',
        query: { limit: 10, cursor: 'cursor-page-2' },
      });
      expect(requestMock).toHaveBeenNthCalledWith(2, {
        method: 'GET',
        path: '/v1/transcriptions',
        query: { limit: 10, cursor: 'cursor-page-3' },
      });
    });

    it('should not make additional requests when no more pages', async () => {
      const requestMock = jest.fn();
      const mockHttp = createMockHttpClient(requestMock);
      const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
        transcriptions: [createMockTranscriptionData({ id: 'trans-1' })],
        next_page_cursor: null,
      };

      const result = new TranscriptionListResult(response, mockHttp, {});
      const transcriptions: SonioxTranscription[] = [];

      for await (const t of result) {
        transcriptions.push(t);
      }

      expect(transcriptions).toHaveLength(1);
      expect(requestMock).not.toHaveBeenCalled();
    });
  });
});

describe('SonioxTranscriptionsAPI', () => {
  describe('create()', () => {
    it('should make POST request with options', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.create({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/transcriptions',
        body: {
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        },
      });
    });

    it('should return SonioxTranscription instance', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData({ status: 'queued' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.create({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
      });

      expect(result).toBeInstanceOf(SonioxTranscription);
      expect(result.status).toBe('queued');
    });

    it('should reject client_reference_id exceeding 256 characters', async () => {
      const mockHttp = createMockHttpClient();
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await expect(
        api.create({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          client_reference_id: 'x'.repeat(257),
        })
      ).rejects.toThrow('client_reference_id exceeds maximum length of 256 characters (got 257)');
    });

    it('should accept client_reference_id at exactly 256 characters', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.create({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        client_reference_id: 'x'.repeat(256),
      });

      expect(requestMock).toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('should make GET request to /v1/transcriptions', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {
          transcriptions: [createMockTranscriptionData()],
          next_page_cursor: null,
        },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.list();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions',
        query: { limit: undefined, cursor: undefined },
      });
    });

    it('should pass limit and cursor options', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { transcriptions: [], next_page_cursor: null },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.list({ limit: 50, cursor: 'my-cursor' });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions',
        query: { limit: 50, cursor: 'my-cursor' },
      });
    });

    it('should return TranscriptionListResult', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {
          transcriptions: [createMockTranscriptionData()],
          next_page_cursor: 'next-cursor',
        },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.list();

      expect(result).toBeInstanceOf(TranscriptionListResult);
      expect(result.transcriptions).toHaveLength(1);
      expect(result.next_page_cursor).toBe('next-cursor');
      expect(result.isPaged()).toBe(true);
    });
  });

  describe('get()', () => {
    it('should make GET request with transcription ID string', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockTranscriptionData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.get('test-transcription-id');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/test-transcription-id',
      });
    });

    it('should accept SonioxTranscription instance and use its id', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockTranscriptionData({ id: 'refreshed-id' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const existing = new SonioxTranscription(createMockTranscriptionData({ id: 'existing-id' }), mockHttp);

      await api.get(existing);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/existing-id',
      });
    });

    it('should return SonioxTranscription instance', async () => {
      const transcriptionData = createMockTranscriptionData({
        id: 'returned-id',
        status: 'completed',
      });
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: transcriptionData,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const transcription = await api.get('returned-id');

      expect(transcription).toBeInstanceOf(SonioxTranscription);
      expect(transcription?.id).toBe('returned-id');
      expect(transcription?.status).toBe('completed');
    });

    it('should return null on 404', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const transcription = await api.get('non-existent-id');

      expect(transcription).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should make DELETE request with transcription ID string', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 204,
        headers: {},
        data: null,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.delete('transcription-to-delete');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/transcriptions/transcription-to-delete',
      });
    });

    it('should accept SonioxTranscription instance and use its id', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 204,
        headers: {},
        data: null,
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const transcription = new SonioxTranscription(
        createMockTranscriptionData({ id: 'transcription-instance-id' }),
        mockHttp
      );

      await api.delete(transcription);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/transcriptions/transcription-instance-id',
      });
    });

    it('should succeed silently on 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await expect(api.delete('non-existent-id')).resolves.toBeUndefined();
    });
  });

  describe('destroy()', () => {
    it('should delete transcription and file when file_id exists', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ file_id: 'file-456' }),
        })
        .mockResolvedValueOnce({
          status: 204,
          headers: {},
          data: null,
        });
      const mockHttp = createMockHttpClient(requestMock);
      const deleteMock = jest.fn().mockResolvedValue(undefined);
      const mockFilesApi = createMockFilesAPI();
      mockFilesApi.delete = deleteMock;
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.destroy('transcription-to-destroy');

      // Should fetch transcription first
      expect(requestMock).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/v1/transcriptions/transcription-to-destroy',
      });
      // Should delete transcription
      expect(requestMock).toHaveBeenNthCalledWith(2, {
        method: 'DELETE',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
      });
      // Should delete file via files API
      expect(deleteMock).toHaveBeenCalledWith('file-456');
    });

    it('should only delete transcription when no file_id', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3' }),
        })
        .mockResolvedValueOnce({
          status: 204,
          headers: {},
          data: null,
        });
      const mockHttp = createMockHttpClient(requestMock);
      const deleteMock = jest.fn();
      const mockFilesApi = createMockFilesAPI();
      mockFilesApi.delete = deleteMock;
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.destroy('transcription-to-destroy');

      // Should fetch transcription
      expect(requestMock).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/v1/transcriptions/transcription-to-destroy',
      });
      // Should delete transcription
      expect(requestMock).toHaveBeenNthCalledWith(2, {
        method: 'DELETE',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
      });
      // Should NOT delete file
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('should succeed when transcription not found (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      // Should not throw - transcription already gone
      await expect(api.destroy('non-existent-id')).resolves.toBeUndefined();

      // Should only have called get (which returned null)
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should succeed when file not found (idempotent)', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ file_id: 'file-456' }),
        })
        .mockResolvedValueOnce({
          status: 204,
          headers: {},
          data: null,
        });
      const mockHttp = createMockHttpClient(requestMock);
      const deleteMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockFilesApi = createMockFilesAPI();
      mockFilesApi.delete = deleteMock;
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      // Should not throw - file already gone
      await expect(api.destroy('transcription-id')).resolves.toBeUndefined();
    });
  });

  describe('getTranscript()', () => {
    it('should fetch transcript from correct endpoint and return SonioxTranscript', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { id: 'trans-id', text: 'Hello world', tokens: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const transcript = await api.getTranscript('transcription-id');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/transcription-id/transcript',
      });
      expect(transcript).toBeInstanceOf(SonioxTranscript);
      expect(transcript?.text).toBe('Hello world');
    });

    it('should return null on 404', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const transcript = await api.getTranscript('non-existent-id');

      expect(transcript).toBeNull();
    });
  });

  describe('wait()', () => {
    it('should get transcription and call its wait method', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockTranscriptionData({ status: 'completed' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.wait('transcription-id');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/transcription-id',
      });
      expect(result.status).toBe('completed');
    });
  });

  describe('transcribe()', () => {
    it('should create transcription from audio_url', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData({ status: 'queued' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
      });

      expect(result).toBeInstanceOf(SonioxTranscription);
      expect(result.status).toBe('queued');
      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/transcriptions',
        body: expect.objectContaining({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        }),
      });
    });

    it('should upload file and create transcription when file provided', async () => {
      const mockFileData: SonioxFileData = {
        id: 'uploaded-file-id',
        filename: 'audio.mp3',
        size: 12345,
        created_at: '2024-11-26T00:00:00Z',
      };
      const uploadMock = jest.fn().mockResolvedValue(new SonioxFile(mockFileData, createMockHttpClient()));
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData({
          status: 'queued',
          file_id: 'uploaded-file-id',
        }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI(uploadMock);
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const buffer = Buffer.from('test audio data');
      const result = await api.transcribe({
        model: 'stt-async-v4',
        file: buffer,
        filename: 'audio.mp3',
      });

      expect(uploadMock).toHaveBeenCalledWith(buffer, {
        filename: 'audio.mp3',
        client_reference_id: undefined,
      });
      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/transcriptions',
        body: expect.objectContaining({
          model: 'stt-async-v4',
          file_id: 'uploaded-file-id',
        }),
      });
      expect(result.file_id).toBe('uploaded-file-id');
    });

    it('should wait for completion when wait=true and fetch transcript', async () => {
      jest.useFakeTimers();

      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello world', tokens: [] },
        });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const resultPromise = api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        wait: true,
      });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(result.transcript).not.toBeNull();
      expect(result.transcript?.text).toBe('Hello world');

      // Verify transcript was fetched
      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000/transcript',
      });

      jest.useRealTimers();
    });

    it('should allow opting out of transcript fetch when wait=true', async () => {
      jest.useFakeTimers();

      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const resultPromise = api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        wait: true,
        fetch_transcript: false,
      });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(result.transcript).toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should not fetch transcript when wait=true but status is error', async () => {
      jest.useFakeTimers();

      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'error', error_message: 'Processing failed' }),
        });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const resultPromise = api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        wait: true,
      });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(result.status).toBe('error');
      expect(result.transcript).toBeNull();
      // Should not call getTranscript for error status
      expect(requestMock).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should pass signal to getTranscript when wait=true', async () => {
      jest.useFakeTimers();

      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
        });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const controller = new AbortController();
      const resultPromise = api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        wait: true,
        signal: controller.signal,
      });

      await jest.advanceTimersByTimeAsync(1000);
      await resultPromise;

      // Verify signal was passed to the transcript fetch
      expect(requestMock).toHaveBeenNthCalledWith(3, {
        method: 'GET',
        path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000/transcript',
        signal: expect.any(Object),
      });

      jest.useRealTimers();
    });

    it('should not wait when wait=false or undefined', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData({ status: 'queued' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
      });

      expect(result.status).toBe('queued');
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should pass webhook options through to create', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTranscriptionData({
          status: 'queued',
          webhook_url: 'https://example.com/webhook',
          webhook_auth_header_name: 'X-Webhook-Auth',
          webhook_auth_header_value: '***masked***',
        }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      await api.transcribe({
        model: 'stt-async-v4',
        audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
        webhook_url: 'https://example.com/webhook',
        webhook_auth_header_name: 'X-Webhook-Auth',
        webhook_auth_header_value: 'secret-token',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/transcriptions',
        body: expect.objectContaining({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
          webhook_auth_header_name: 'X-Webhook-Auth',
          webhook_auth_header_value: 'secret-token',
        }),
      });
    });

    describe('audio source validation', () => {
      it('should throw when no audio source is provided', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
          } as TranscribeOptions)
        ).rejects.toThrow('One of file, file_id, or audio_url must be provided');
      });

      it('should throw when both file and audio_url are provided', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            file: Buffer.from('test'),
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          } as unknown as TranscribeOptions)
        ).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
      });

      it('should throw when both file and file_id are provided', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            file: Buffer.from('test'),
            file_id: 'existing-file-id',
          } as unknown as TranscribeOptions)
        ).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
      });

      it('should throw when both audio_url and file_id are provided', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            file_id: 'existing-file-id',
          } as unknown as TranscribeOptions)
        ).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
      });

      it('should throw when all three audio sources are provided', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            file: Buffer.from('test'),
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            file_id: 'existing-file-id',
          } as unknown as TranscribeOptions)
        ).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
      });
    });

    describe('webhook auth header validation', () => {
      it('should throw when only webhook_auth_header_name is provided', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            webhook_url: 'https://example.com/webhook',
            webhook_auth_header_name: 'X-Webhook-Secret',
          })
        ).rejects.toThrow('webhook_auth_header_name and webhook_auth_header_value must be provided together');
      });

      it('should throw when only webhook_auth_header_value is provided', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            webhook_url: 'https://example.com/webhook',
            webhook_auth_header_value: 'secret-token',
          })
        ).rejects.toThrow('webhook_auth_header_name and webhook_auth_header_value must be provided together');
      });

      it('should accept when both webhook auth headers are provided', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
          webhook_auth_header_name: 'X-Webhook-Secret',
          webhook_auth_header_value: 'secret-token',
        });

        expect(requestMock).toHaveBeenCalled();
      });

      it('should accept when neither webhook auth header is provided', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
        });

        expect(requestMock).toHaveBeenCalled();
      });
    });

    describe('client_reference_id validation', () => {
      it('should reject client_reference_id exceeding 256 characters', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            client_reference_id: 'x'.repeat(257),
          })
        ).rejects.toThrow('client_reference_id exceeds maximum length of 256 characters (got 257)');
      });

      it('should accept client_reference_id at exactly 256 characters', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          client_reference_id: 'x'.repeat(256),
        });

        expect(requestMock).toHaveBeenCalled();
      });
    });

    describe('webhook_query option', () => {
      it('should append query params from Record to webhook_url', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
          webhook_query: { transcription_id: 'abc123', user_id: '456' },
        });

        expect(requestMock).toHaveBeenCalledWith({
          method: 'POST',
          path: '/v1/transcriptions',
          body: expect.objectContaining({
            webhook_url: 'https://example.com/webhook?transcription_id=abc123&user_id=456',
          }),
        });
      });

      it('should append query params from string to webhook_url', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
          webhook_query: 'key=value&other=data',
        });

        expect(requestMock).toHaveBeenCalledWith({
          method: 'POST',
          path: '/v1/transcriptions',
          body: expect.objectContaining({
            webhook_url: 'https://example.com/webhook?key=value&other=data',
          }),
        });
      });

      it('should append query params from URLSearchParams to webhook_url', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const params = new URLSearchParams();
        params.append('id', '123');
        params.append('type', 'test');

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
          webhook_query: params,
        });

        expect(requestMock).toHaveBeenCalledWith({
          method: 'POST',
          path: '/v1/transcriptions',
          body: expect.objectContaining({
            webhook_url: 'https://example.com/webhook?id=123&type=test',
          }),
        });
      });

      it('should preserve existing query params in webhook_url', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook?existing=param',
          webhook_query: { new: 'value' },
        });

        expect(requestMock).toHaveBeenCalledWith({
          method: 'POST',
          path: '/v1/transcriptions',
          body: expect.objectContaining({
            webhook_url: 'https://example.com/webhook?existing=param&new=value',
          }),
        });
      });

      it('should not modify webhook_url when webhook_query is not provided', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_url: 'https://example.com/webhook',
        });

        expect(requestMock).toHaveBeenCalledWith({
          method: 'POST',
          path: '/v1/transcriptions',
          body: expect.objectContaining({
            webhook_url: 'https://example.com/webhook',
          }),
        });
      });

      it('should ignore webhook_query when webhook_url is not provided', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          webhook_query: { ignored: 'value' },
        });

        expect(requestMock).toHaveBeenCalledWith({
          method: 'POST',
          path: '/v1/transcriptions',
          body: expect.objectContaining({
            webhook_url: undefined,
          }),
        });
      });
    });

    describe('audio_url validation', () => {
      it('should throw when audio_url is not a valid HTTP/HTTPS URL', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'ftp://example.com/audio.mp3',
          })
        ).rejects.toThrow('audio_url must be a valid HTTP or HTTPS URL');
      });

      it('should throw when audio_url contains whitespace', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://example.com/audio file.mp3',
          })
        ).rejects.toThrow('audio_url must be a valid HTTP or HTTPS URL');
      });

      it('should throw when audio_url is empty string', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: '',
          })
        ).rejects.toThrow('audio_url must be a valid HTTP or HTTPS URL');
      });

      it('should accept valid HTTP URL', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'http://example.com/audio.mp3',
        });

        expect(requestMock).toHaveBeenCalled();
      });

      it('should accept valid HTTPS URL', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://example.com/path/to/audio.mp3?token=abc123',
        });

        expect(requestMock).toHaveBeenCalled();
      });
    });

    describe('signal and timeout options', () => {
      it('should pass signal to file upload', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const uploadMock = jest.fn().mockResolvedValue({
          id: 'uploaded-file-id',
          filename: 'test.mp3',
          size: 1000,
          created_at: new Date().toISOString(),
        });
        const mockFilesApi = createMockFilesAPI(uploadMock);
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const controller = new AbortController();
        await api.transcribe({
          model: 'stt-async-v4',
          file: Buffer.from('test'),
          signal: controller.signal,
        });

        expect(uploadMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            signal: expect.any(Object),
          })
        );
      });

      it('should pass signal to create request', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const controller = new AbortController();
        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          signal: controller.signal,
        });

        expect(requestMock).toHaveBeenCalledWith(
          expect.objectContaining({
            signal: expect.any(Object),
          })
        );
      });

      it('should abort on signal when uploading file', async () => {
        const mockHttp = createMockHttpClient();
        const uploadMock = jest.fn().mockImplementation(() => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Upload aborted')), 100);
          });
        });
        const mockFilesApi = createMockFilesAPI(uploadMock);
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const controller = new AbortController();
        const promise = api.transcribe({
          model: 'stt-async-v4',
          file: Buffer.from('test'),
          signal: controller.signal,
        });

        controller.abort();
        await expect(promise).rejects.toThrow();
      });

      it('should create timeout-based signal when timeout_ms is provided', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          timeout_ms: 30000,
        });

        expect(requestMock).toHaveBeenCalledWith(
          expect.objectContaining({
            signal: expect.any(Object),
          })
        );
      });

      it('should timeout when timeout_ms expires', async () => {
        const mockHttp = createMockHttpClient();
        const uploadMock = jest.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  id: 'uploaded-file-id',
                  filename: 'test.mp3',
                  size: 1000,
                  created_at: new Date().toISOString(),
                }),
              200
            );
          });
        });
        const mockFilesApi = createMockFilesAPI(uploadMock);
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        // Use a very short timeout
        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            file: Buffer.from('test'),
            timeout_ms: 10,
          })
        ).rejects.toThrow();
      }, 1000);

      it('should pass signal to wait when wait=true', async () => {
        let callCount = 0;
        const requestMock = jest.fn().mockImplementation(() => {
          callCount++;
          // First call is create, subsequent calls are refresh
          if (callCount === 1) {
            return Promise.resolve({
              status: 201,
              headers: {},
              data: createMockTranscriptionData({ status: 'queued' }),
            });
          }
          return Promise.resolve({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({ status: 'completed' }),
          });
        });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const controller = new AbortController();
        const result = await api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          signal: controller.signal,
        });

        expect(result.status).toBe('completed');
      });

      describe('timeout_ms validation', () => {
        it('should throw when timeout_ms is NaN', async () => {
          const mockHttp = createMockHttpClient();
          const mockFilesApi = createMockFilesAPI();
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          await expect(
            api.transcribe({
              model: 'stt-async-v4',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
              timeout_ms: NaN,
            })
          ).rejects.toThrow('timeout_ms must be a finite positive number');
        });

        it('should throw when timeout_ms is Infinity', async () => {
          const mockHttp = createMockHttpClient();
          const mockFilesApi = createMockFilesAPI();
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          await expect(
            api.transcribe({
              model: 'stt-async-v4',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
              timeout_ms: Infinity,
            })
          ).rejects.toThrow('timeout_ms must be a finite positive number');
        });

        it('should throw when timeout_ms is negative', async () => {
          const mockHttp = createMockHttpClient();
          const mockFilesApi = createMockFilesAPI();
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          await expect(
            api.transcribe({
              model: 'stt-async-v4',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
              timeout_ms: -1000,
            })
          ).rejects.toThrow('timeout_ms must be a finite positive number');
        });

        it('should throw when timeout_ms is zero', async () => {
          const mockHttp = createMockHttpClient();
          const mockFilesApi = createMockFilesAPI();
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          await expect(
            api.transcribe({
              model: 'stt-async-v4',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
              timeout_ms: 0,
            })
          ).rejects.toThrow('timeout_ms must be a finite positive number');
        });
      });

      describe('combined timeout_ms and signal', () => {
        it('should abort with timeout reason when timeout fires first', async () => {
          const mockHttp = createMockHttpClient();
          // Create an upload mock that respects abort signals
          const uploadMock = jest.fn().mockImplementation((_file: unknown, options?: { signal?: AbortSignal }) => {
            return new Promise((resolve, reject) => {
              const timeoutId = setTimeout(
                () =>
                  resolve({
                    id: 'uploaded-file-id',
                    filename: 'test.mp3',
                    size: 1000,
                    created_at: new Date().toISOString(),
                  }),
                500
              );

              // Listen for abort signal
              if (options?.signal) {
                options.signal.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(timeoutId);
                    reject(options.signal?.reason ?? new Error('Aborted'));
                  },
                  { once: true }
                );
              }
            });
          });
          const mockFilesApi = createMockFilesAPI(uploadMock);
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          const controller = new AbortController();
          await expect(
            api.transcribe({
              model: 'stt-async-v4',
              file: Buffer.from('test'),
              timeout_ms: 50,
              signal: controller.signal,
            })
          ).rejects.toThrow('timed out');
        }, 1000);

        it('should abort with user reason when signal fires first', async () => {
          const mockHttp = createMockHttpClient();
          // Create an upload mock that respects abort signals
          const uploadMock = jest.fn().mockImplementation((_file: unknown, options?: { signal?: AbortSignal }) => {
            return new Promise((resolve, reject) => {
              const timeoutId = setTimeout(
                () =>
                  resolve({
                    id: 'uploaded-file-id',
                    filename: 'test.mp3',
                    size: 1000,
                    created_at: new Date().toISOString(),
                  }),
                500
              );

              // Listen for abort signal
              if (options?.signal) {
                options.signal.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(timeoutId);
                    reject(options.signal?.reason ?? new Error('Aborted'));
                  },
                  { once: true }
                );
              }
            });
          });
          const mockFilesApi = createMockFilesAPI(uploadMock);
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          const controller = new AbortController();
          const promise = api.transcribe({
            model: 'stt-async-v4',
            file: Buffer.from('test'),
            timeout_ms: 10000,
            signal: controller.signal,
          });

          // Abort after a short delay
          setTimeout(() => controller.abort(new Error('User cancelled')), 50);

          await expect(promise).rejects.toThrow('User cancelled');
        }, 1000);

        it('should work correctly when both timeout and signal are provided but neither fires', async () => {
          const requestMock = jest.fn().mockResolvedValue({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued' }),
          });
          const mockHttp = createMockHttpClient(requestMock);
          const mockFilesApi = createMockFilesAPI();
          const api = new SonioxSttApi(mockHttp, mockFilesApi);

          const controller = new AbortController();
          const result = await api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            timeout_ms: 30000,
            signal: controller.signal,
          });

          expect(result.status).toBe('queued');
        });
      });
    });

    describe('cleanup option', () => {
      it('should throw when cleanup is used without wait=true', async () => {
        const mockHttp = createMockHttpClient();
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            cleanup: ['file'],
          })
        ).rejects.toThrow('cleanup can only be used when wait=true');
      });

      it('should delete file when cleanup includes "file"', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({ status: 'completed', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
          });
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn().mockResolvedValue(undefined);
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: ['file'],
        });

        await jest.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        expect(deleteMock).toHaveBeenCalledWith('file-123');
        expect(result.transcript?.text).toBe('Hello');

        jest.useRealTimers();
      });

      it('should delete transcription when cleanup includes "transcription"', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({ status: 'completed' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
          })
          .mockResolvedValueOnce({
            status: 204,
            headers: {},
            data: null,
          });
        const mockHttp = createMockHttpClient(requestMock);
        const mockFilesApi = createMockFilesAPI();
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: ['transcription'],
        });

        await jest.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        // Transcript is available even though transcription was deleted
        expect(result.transcript?.text).toBe('Hello');
        expect(requestMock).toHaveBeenLastCalledWith({
          method: 'DELETE',
          path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
        });

        jest.useRealTimers();
      });

      it('should delete both file and transcription when cleanup includes both', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({ status: 'completed', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
          })
          .mockResolvedValueOnce({
            status: 204,
            headers: {},
            data: null,
          });
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn().mockResolvedValue(undefined);
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: ['file', 'transcription'],
        });

        await jest.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        // Transcript is available even though both file and transcription were deleted
        expect(result.transcript?.text).toBe('Hello');
        expect(deleteMock).toHaveBeenCalledWith('file-123');
        expect(requestMock).toHaveBeenLastCalledWith({
          method: 'DELETE',
          path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
        });

        jest.useRealTimers();
      });

      it('should not delete file when no file_id exists', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({
              status: 'queued',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({
              status: 'completed',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
          });
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn();
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: ['file'],
        });

        await jest.advanceTimersByTimeAsync(1000);
        await resultPromise;

        expect(deleteMock).not.toHaveBeenCalled();

        jest.useRealTimers();
      });

      it('should cleanup on error when wait=true with file upload', async () => {
        const mockFileData: SonioxFileData = {
          id: 'uploaded-file-id',
          filename: 'audio.mp3',
          size: 12345,
          created_at: '2024-11-26T00:00:00Z',
        };
        const uploadMock = jest.fn().mockResolvedValue(new SonioxFile(mockFileData, createMockHttpClient()));
        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued', file_id: 'uploaded-file-id' }),
          })
          .mockRejectedValueOnce(new Error('Network error during wait'));
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn().mockResolvedValue(undefined);
        const mockFilesApi = createMockFilesAPI(uploadMock);
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            file: Buffer.from('test'),
            wait: true,
            cleanup: ['file', 'transcription'],
          })
        ).rejects.toThrow('Network error during wait');

        // Should still cleanup even on error
        expect(deleteMock).toHaveBeenCalledWith('uploaded-file-id');
      });

      it('should cleanup file on error with audio_url when transcription response has file_id', async () => {
        // This tests the case where:
        // 1. Using audio_url (no file upload)
        // 2. API creates a file and returns file_id in transcription response
        // 3. wait() throws (timeout/abort/network error)
        // 4. Cleanup should still delete the file from the transcription response
        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            // API returns file_id even though we used audio_url
            data: createMockTranscriptionData({
              status: 'queued',
              file_id: 'api-created-file-id',
              audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            }),
          })
          .mockRejectedValueOnce(new Error('Timeout during wait'));
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn().mockResolvedValue(undefined);
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        await expect(
          api.transcribe({
            model: 'stt-async-v4',
            audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
            wait: true,
            cleanup: ['file', 'transcription'],
          })
        ).rejects.toThrow('Timeout during wait');

        // Should cleanup the file_id from the transcription response
        expect(deleteMock).toHaveBeenCalledWith('api-created-file-id');
        // Should also delete the transcription
        expect(requestMock).toHaveBeenLastCalledWith({
          method: 'DELETE',
          path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
        });
      });

      it('should cleanup when transcription status is error', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({
              status: 'error',
              file_id: 'file-123',
              error_type: 'processing_error',
              error_message: 'Failed to process audio',
            }),
          })
          .mockResolvedValueOnce({
            status: 204,
            headers: {},
            data: null,
          });
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn().mockResolvedValue(undefined);
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: ['file', 'transcription'],
        });

        await jest.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        expect(result.status).toBe('error');
        expect(result.transcript).toBeNull(); // No transcript for error status
        expect(deleteMock).toHaveBeenCalledWith('file-123');
        expect(requestMock).toHaveBeenLastCalledWith({
          method: 'DELETE',
          path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
        });

        jest.useRealTimers();
      });

      it('should not perform cleanup when cleanup array is empty', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({ status: 'completed', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
          });
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn();
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: [],
        });

        await jest.advanceTimersByTimeAsync(1000);
        await resultPromise;

        expect(deleteMock).not.toHaveBeenCalled();
        // create, wait, and getTranscript calls - no delete
        expect(requestMock).toHaveBeenCalledTimes(3);

        jest.useRealTimers();
      });

      it('should ignore cleanup errors and still return result', async () => {
        jest.useFakeTimers();

        const requestMock = jest
          .fn()
          .mockResolvedValueOnce({
            status: 201,
            headers: {},
            data: createMockTranscriptionData({ status: 'queued', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: createMockTranscriptionData({ status: 'completed', file_id: 'file-123' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            headers: {},
            data: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'Hello', tokens: [] },
          })
          .mockRejectedValueOnce(new Error('Delete failed'));
        const mockHttp = createMockHttpClient(requestMock);
        const deleteMock = jest.fn().mockRejectedValue(new Error('File delete failed'));
        const mockFilesApi = createMockFilesAPI();
        mockFilesApi.delete = deleteMock;
        const api = new SonioxSttApi(mockHttp, mockFilesApi);

        const resultPromise = api.transcribe({
          model: 'stt-async-v4',
          audio_url: 'https://soniox.com/media/examples/coffee_shop.mp3',
          wait: true,
          cleanup: ['file', 'transcription'],
        });

        await jest.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        // Should still return the result despite cleanup errors
        expect(result.status).toBe('completed');
        expect(result.transcript?.text).toBe('Hello');

        jest.useRealTimers();
      });
    });
  });

  describe('delete_all()', () => {
    it('should delete all transcriptions across pages', async () => {
      const requestMock = jest
        .fn()
        // list() call - returns page 1
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            transcriptions: [
              createMockTranscriptionData({ id: 'tx-1', status: 'completed' }),
              createMockTranscriptionData({ id: 'tx-2', status: 'error' }),
            ],
            next_page_cursor: 'cursor-page-2',
          },
        })
        // delete tx-1
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null })
        // delete tx-2
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null })
        // pagination - page 2
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            transcriptions: [createMockTranscriptionData({ id: 'tx-3', status: 'completed' })],
            next_page_cursor: null,
          },
        })
        // delete tx-3
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null });

      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.delete_all();

      expect(result).toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(5);
    });

    it('should return undefined when no transcriptions exist', async () => {
      const requestMock = jest.fn().mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { transcriptions: [], next_page_cursor: null },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const result = await api.delete_all();

      expect(result).toBeUndefined();
      // Only the list() call
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should respect abort signal and stop early', async () => {
      const requestMock = jest.fn().mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          transcriptions: [createMockTranscriptionData({ id: 'tx-1' }), createMockTranscriptionData({ id: 'tx-2' })],
          next_page_cursor: null,
        },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const mockFilesApi = createMockFilesAPI();
      const api = new SonioxSttApi(mockHttp, mockFilesApi);

      const controller = new AbortController();
      controller.abort();

      await expect(api.delete_all({ signal: controller.signal })).rejects.toThrow();
      // Only the list() call, no deletes
      expect(requestMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('segmentTranscript', () => {
  // Helper to create mock tokens
  const createToken = (
    text: string,
    start_ms: number,
    end_ms: number,
    overrides: Partial<TranscriptToken> = {}
  ): TranscriptToken => ({
    text,
    start_ms,
    end_ms,
    confidence: 0.95,
    ...overrides,
  });

  it('should return empty array for empty tokens', () => {
    const result = segmentTranscript([]);
    expect(result).toEqual([]);
  });

  it('should return single segment when all tokens have same speaker and language', () => {
    const tokens = [
      createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
      createToken(' world', 500, 1000, { speaker: '1', language: 'en' }),
    ];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: 'Hello world',
      start_ms: 0,
      end_ms: 1000,
      speaker: '1',
      language: 'en',
      tokens,
    });
  });

  it('should create new segment when speaker changes', () => {
    const tokens = [
      createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
      createToken(' world', 500, 1000, { speaker: '1', language: 'en' }),
      createToken('Hi', 1000, 1200, { speaker: '2', language: 'en' }),
    ];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('Hello world');
    expect(result[0]?.speaker).toBe('1');
    expect(result[1]?.text).toBe('Hi');
    expect(result[1]?.speaker).toBe('2');
  });

  it('should create new segment when language changes', () => {
    const tokens = [
      createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
      createToken('Hola', 500, 1000, { speaker: '1', language: 'es' }),
    ];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('Hello');
    expect(result[0]?.language).toBe('en');
    expect(result[1]?.text).toBe('Hola');
    expect(result[1]?.language).toBe('es');
  });

  it('should handle tokens without speaker or language', () => {
    const tokens = [createToken('Hello', 0, 500), createToken(' world', 500, 1000)];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('Hello world');
    expect(result[0]?.speaker).toBeUndefined();
    expect(result[0]?.language).toBeUndefined();
  });

  it('should create new segment when speaker becomes defined', () => {
    const tokens = [createToken('Hello', 0, 500), createToken('world', 500, 1000, { speaker: '1' })];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(2);
    expect(result[0]?.speaker).toBeUndefined();
    expect(result[1]?.speaker).toBe('1');
  });

  it('should preserve timing from first and last tokens', () => {
    const tokens = [
      createToken('One', 100, 200, { speaker: '1' }),
      createToken('two', 250, 350, { speaker: '1' }),
      createToken('three', 400, 600, { speaker: '1' }),
    ];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(1);
    expect(result[0]?.start_ms).toBe(100);
    expect(result[0]?.end_ms).toBe(600);
  });

  it('should include original tokens in each segment', () => {
    const tokens = [createToken('Hello', 0, 500, { speaker: '1' }), createToken('Hi', 600, 800, { speaker: '2' })];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(2);
    expect(result[0]?.tokens).toHaveLength(1);
    expect(result[0]?.tokens[0]?.text).toBe('Hello');
    expect(result[1]?.tokens).toHaveLength(1);
    expect(result[1]?.tokens[0]?.text).toBe('Hi');
  });

  it('should handle multiple speaker and language changes', () => {
    const tokens = [
      createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
      createToken('Hola', 500, 1000, { speaker: '1', language: 'es' }),
      createToken('Hi', 1000, 1200, { speaker: '2', language: 'en' }),
      createToken(' there', 1200, 1500, { speaker: '2', language: 'en' }),
    ];

    const result = segmentTranscript(tokens);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ text: 'Hello', speaker: '1', language: 'en' });
    expect(result[1]).toMatchObject({ text: 'Hola', speaker: '1', language: 'es' });
    expect(result[2]).toMatchObject({ text: 'Hi there', speaker: '2', language: 'en' });
  });

  describe('group_by option', () => {
    it('should group by speaker only when group_by is ["speaker"]', () => {
      const tokens = [
        createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
        createToken(' Hola', 500, 1000, { speaker: '1', language: 'es' }),
        createToken('Hi', 1000, 1200, { speaker: '2', language: 'en' }),
      ];

      const result = segmentTranscript(tokens, { group_by: ['speaker'] });

      expect(result).toHaveLength(2);
      expect(result[0]?.text).toBe('Hello Hola');
      expect(result[0]?.speaker).toBe('1');
      expect(result[1]?.text).toBe('Hi');
      expect(result[1]?.speaker).toBe('2');
    });

    it('should group by language only when group_by is ["language"]', () => {
      const tokens = [
        createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
        createToken(' Hi', 500, 1000, { speaker: '2', language: 'en' }),
        createToken(' Hola', 1000, 1200, { speaker: '2', language: 'es' }),
      ];

      const result = segmentTranscript(tokens, { group_by: ['language'] });

      expect(result).toHaveLength(2);
      expect(result[0]?.text).toBe('Hello Hi');
      expect(result[0]?.language).toBe('en');
      expect(result[1]?.text).toBe(' Hola');
      expect(result[1]?.language).toBe('es');
    });

    it('should put all tokens in one segment when group_by is empty', () => {
      const tokens = [
        createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
        createToken(' Hola', 500, 1000, { speaker: '2', language: 'es' }),
        createToken(' Hi', 1000, 1200, { speaker: '3', language: 'fr' }),
      ];

      const result = segmentTranscript(tokens, { group_by: [] });

      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('Hello Hola Hi');
    });

    it('should use default group_by when options is undefined', () => {
      const tokens = [
        createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
        createToken('Hola', 500, 1000, { speaker: '1', language: 'es' }),
      ];

      const result = segmentTranscript(tokens);

      expect(result).toHaveLength(2);
    });

    it('should use default group_by when group_by is undefined', () => {
      const tokens = [
        createToken('Hello', 0, 500, { speaker: '1', language: 'en' }),
        createToken('Hola', 500, 1000, { speaker: '1', language: 'es' }),
      ];

      const result = segmentTranscript(tokens, {});

      expect(result).toHaveLength(2);
    });
  });
});

describe('SonioxTranscript', () => {
  describe('segments()', () => {
    it('should return segments from tokens', () => {
      const tokens: TranscriptToken[] = [
        { text: 'Hello', start_ms: 0, end_ms: 500, confidence: 0.9, speaker: '1' },
        { text: ' Hi', start_ms: 600, end_ms: 800, confidence: 0.95, speaker: '2' },
      ];

      const transcript = new SonioxTranscript({
        id: 'trans-123',
        text: 'Hello Hi',
        tokens,
      });

      const segments = transcript.segments();

      expect(segments).toHaveLength(2);
      expect(segments[0]?.text).toBe('Hello');
      expect(segments[0]?.speaker).toBe('1');
      expect(segments[1]?.text).toBe(' Hi');
      expect(segments[1]?.speaker).toBe('2');
    });

    it('should return empty array for empty tokens', () => {
      const transcript = new SonioxTranscript({
        id: 'trans-123',
        text: '',
        tokens: [],
      });

      const segments = transcript.segments();

      expect(segments).toEqual([]);
    });

    it('should accept group_by option', () => {
      const tokens: TranscriptToken[] = [
        { text: 'Hello', start_ms: 0, end_ms: 500, confidence: 0.9, speaker: '1', language: 'en' },
        { text: ' Hola', start_ms: 600, end_ms: 800, confidence: 0.95, speaker: '1', language: 'es' },
      ];

      const transcript = new SonioxTranscript({
        id: 'trans-123',
        text: 'Hello Hola',
        tokens,
      });

      // Default behavior creates 2 segments (language changes)
      expect(transcript.segments()).toHaveLength(2);

      // With speaker-only grouping, creates 1 segment
      const bySpeaker = transcript.segments({ group_by: ['speaker'] });
      expect(bySpeaker).toHaveLength(1);
      expect(bySpeaker[0]?.text).toBe('Hello Hola');
    });
  });
});
