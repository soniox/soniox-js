import { SonioxVoice, SonioxVoicesAPI, VoiceListResult } from '../../src/async/voices';
import { SonioxHttpError } from '../../src/http/errors';
import type { HttpClient } from '../../src/http';
import type { ListVoicesResponse, SonioxVoiceData } from '../../src/types/public';

// Helper to create a mock 404 error
const createMock404Error = () =>
  new SonioxHttpError({
    code: 'http_error',
    message: 'HTTP 404',
    url: 'https://api.soniox.com/v1/voices/test',
    method: 'GET',
    statusCode: 404,
    headers: {},
    bodyText: 'Not found',
  });

// Helper to create a mock 500 error
const createMock500Error = () =>
  new SonioxHttpError({
    code: 'http_error',
    message: 'HTTP 500',
    url: 'https://api.soniox.com/v1/voices/test',
    method: 'DELETE',
    statusCode: 500,
    headers: {},
    bodyText: 'Server error',
  });

// Helper to create mock voice data
const createMockVoiceData = (overrides: Partial<SonioxVoiceData> = {}): SonioxVoiceData => ({
  id: '21b9c8e2-1c3a-4d5e-9f8a-123456789abc',
  name: 'My narrator',
  filename: 'reference.wav',
  created_at: '2024-11-26T00:00:00Z',
  models: [{ model: 'tts-rt-v1', status: 'ready', error_type: null, error_message: null }],
  ...overrides,
});

// Helper to create a mock HttpClient
const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

describe('SonioxVoice', () => {
  describe('toJSON()', () => {
    it('should return the raw voice data', () => {
      const data = createMockVoiceData();
      const voice = new SonioxVoice(data, createMockHttpClient());

      expect(voice.toJSON()).toEqual(data);
    });
  });

  describe('isReady()', () => {
    it('should return true when the model is ready', () => {
      const voice = new SonioxVoice(createMockVoiceData(), createMockHttpClient());
      expect(voice.isReady('tts-rt-v1')).toBe(true);
    });

    it('should return false when the model is not ready', () => {
      const voice = new SonioxVoice(
        createMockVoiceData({ models: [{ model: 'tts-rt-v1', status: 'processing' }] }),
        createMockHttpClient()
      );
      expect(voice.isReady('tts-rt-v1')).toBe(false);
    });

    it('should return false for an unknown model', () => {
      const voice = new SonioxVoice(createMockVoiceData(), createMockHttpClient());
      expect(voice.isReady('tts-rt-v9')).toBe(false);
    });
  });

  describe('recompute()', () => {
    it('should POST to the recompute endpoint and return an updated voice', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockVoiceData({ models: [{ model: 'tts-rt-v2', status: 'processing' }] }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const voice = new SonioxVoice(createMockVoiceData(), mockHttp);

      const updated = await voice.recompute();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/voices/21b9c8e2-1c3a-4d5e-9f8a-123456789abc/recompute',
        body: {},
      });
      expect(updated).toBeInstanceOf(SonioxVoice);
      expect(updated.models[0]?.model).toBe('tts-rt-v2');
    });

    it('should include the model in the body when provided', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockVoiceData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const voice = new SonioxVoice(createMockVoiceData(), mockHttp);

      await voice.recompute({ model: 'tts-rt-v2' });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/voices/21b9c8e2-1c3a-4d5e-9f8a-123456789abc/recompute',
        body: { model: 'tts-rt-v2' },
      });
    });
  });

  describe('delete()', () => {
    it('should call DELETE on the correct endpoint', async () => {
      const requestMock = jest.fn().mockResolvedValue({ status: 204, headers: {}, data: null });
      const mockHttp = createMockHttpClient(requestMock);
      const voice = new SonioxVoice(createMockVoiceData(), mockHttp);

      await voice.delete();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/voices/21b9c8e2-1c3a-4d5e-9f8a-123456789abc',
      });
    });

    it('should succeed silently on 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const voice = new SonioxVoice(createMockVoiceData(), mockHttp);

      await expect(voice.delete()).resolves.toBeUndefined();
    });
  });
});

describe('VoiceListResult', () => {
  it('should create result with voices from initial response', () => {
    const mockHttp = createMockHttpClient();
    const response: ListVoicesResponse<SonioxVoiceData> = {
      voices: [createMockVoiceData({ id: 'voice-1' }), createMockVoiceData({ id: 'voice-2' })],
      next_page_cursor: null,
    };

    const result = new VoiceListResult(response, mockHttp, undefined);

    expect(result.voices).toHaveLength(2);
    expect(result.voices[0]?.id).toBe('voice-1');
    expect(result.voices[1]?.id).toBe('voice-2');
    expect(result.next_page_cursor).toBeNull();
  });

  describe('isPaged()', () => {
    it('should return false when next_page_cursor is null', () => {
      const response: ListVoicesResponse<SonioxVoiceData> = { voices: [], next_page_cursor: null };
      const result = new VoiceListResult(response, createMockHttpClient(), undefined);

      expect(result.isPaged()).toBe(false);
    });

    it('should return true when next_page_cursor exists', () => {
      const response: ListVoicesResponse<SonioxVoiceData> = { voices: [], next_page_cursor: 'cursor-abc' };
      const result = new VoiceListResult(response, createMockHttpClient(), undefined);

      expect(result.isPaged()).toBe(true);
    });
  });

  describe('async iteration', () => {
    it('should yield all voices from a single page', async () => {
      const response: ListVoicesResponse<SonioxVoiceData> = {
        voices: [createMockVoiceData({ id: 'voice-1' }), createMockVoiceData({ id: 'voice-2' })],
        next_page_cursor: null,
      };

      const result = new VoiceListResult(response, createMockHttpClient(), undefined);
      const voices: SonioxVoice[] = [];

      for await (const voice of result) {
        voices.push(voice);
      }

      expect(voices.map((v) => v.id)).toEqual(['voice-1', 'voice-2']);
    });

    it('should automatically fetch and yield voices from multiple pages', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { voices: [createMockVoiceData({ id: 'voice-3' })], next_page_cursor: 'cursor-page-3' },
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { voices: [createMockVoiceData({ id: 'voice-4' })], next_page_cursor: null },
        });

      const mockHttp = createMockHttpClient(requestMock);
      const initialResponse: ListVoicesResponse<SonioxVoiceData> = {
        voices: [createMockVoiceData({ id: 'voice-1' }), createMockVoiceData({ id: 'voice-2' })],
        next_page_cursor: 'cursor-page-2',
      };

      const result = new VoiceListResult(initialResponse, mockHttp, 10);
      const voices: SonioxVoice[] = [];

      for await (const voice of result) {
        voices.push(voice);
      }

      expect(voices.map((v) => v.id)).toEqual(['voice-1', 'voice-2', 'voice-3', 'voice-4']);
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/v1/voices',
        query: { limit: 10, cursor: 'cursor-page-2' },
      });
      expect(requestMock).toHaveBeenNthCalledWith(2, {
        method: 'GET',
        path: '/v1/voices',
        query: { limit: 10, cursor: 'cursor-page-3' },
      });
    });

    it('should not make additional requests when no more pages', async () => {
      const requestMock = jest.fn();
      const mockHttp = createMockHttpClient(requestMock);
      const response: ListVoicesResponse<SonioxVoiceData> = {
        voices: [createMockVoiceData({ id: 'voice-1' })],
        next_page_cursor: null,
      };

      const result = new VoiceListResult(response, mockHttp, undefined);
      const voices: SonioxVoice[] = [];

      for await (const voice of result) {
        voices.push(voice);
      }

      expect(voices).toHaveLength(1);
      expect(requestMock).not.toHaveBeenCalled();
    });
  });
});

describe('SonioxVoicesAPI', () => {
  describe('create()', () => {
    it('should POST multipart form data with name and file', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockVoiceData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const buffer = Buffer.from('reference audio data');
      const voice = await api.create({ name: 'My narrator', file: buffer, filename: 'reference.wav' });

      expect(voice).toBeInstanceOf(SonioxVoice);
      expect(voice.id).toBe('21b9c8e2-1c3a-4d5e-9f8a-123456789abc');
      expect(requestMock).toHaveBeenCalledTimes(1);

      const callArgs = requestMock.mock.calls[0]?.[0];
      expect(callArgs?.method).toBe('POST');
      expect(callArgs?.path).toBe('/v1/voices');
      expect(callArgs?.body).toBeInstanceOf(FormData);

      const formData = callArgs?.body as FormData;
      expect(formData.get('name')).toBe('My narrator');
      const fileField = formData.get('file') as File;
      expect(fileField.name).toBe('reference.wav');
    });

    it('should use a default filename when none is provided', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockVoiceData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await api.create({ name: 'My narrator', file: Buffer.from('audio') });

      const formData = requestMock.mock.calls[0]?.[0]?.body as FormData;
      const fileField = formData.get('file') as File;
      expect(fileField.name).toBe('voice');
    });

    it('should pass signal and timeout_ms to the request', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockVoiceData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const controller = new AbortController();
      await api.create({
        name: 'My narrator',
        file: Buffer.from('audio'),
        signal: controller.signal,
        timeout_ms: 60000,
      });

      const callArgs = requestMock.mock.calls[0]?.[0];
      expect(callArgs?.signal).toBe(controller.signal);
      expect(callArgs?.timeoutMs).toBe(60000);
    });

    it('should reject a reference clip exceeding 10 MB', async () => {
      const requestMock = jest.fn();
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const oversizedBlob = new Blob([new ArrayBuffer(8)]);
      Object.defineProperty(oversizedBlob, 'size', { value: 10 * 1024 * 1024 + 1 });

      await expect(api.create({ name: 'Too big', file: oversizedBlob })).rejects.toThrow(
        'exceeds maximum allowed size (10485760 bytes)'
      );
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('should throw for an invalid input type', async () => {
      const requestMock = jest.fn();
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      // @ts-expect-error - Testing invalid input type
      await expect(api.create({ name: 'Bad', file: 12345 })).rejects.toThrow(
        'Invalid file input. Expected Buffer, Uint8Array, Blob, or ReadableStream.'
      );
      expect(requestMock).not.toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('should make a GET request to /v1/voices', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { voices: [createMockVoiceData()], next_page_cursor: null },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const result = await api.list();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/voices',
        query: { limit: undefined, cursor: undefined },
      });
      expect(result).toBeInstanceOf(VoiceListResult);
      expect(result.voices).toHaveLength(1);
    });

    it('should pass limit and cursor options', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { voices: [], next_page_cursor: null },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await api.list({ limit: 5, cursor: 'my-cursor' });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/voices',
        query: { limit: 5, cursor: 'my-cursor' },
      });
    });
  });

  describe('count()', () => {
    it('should make a GET request to /v1/voices/count', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { total: 3 },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const result = await api.count();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/voices/count',
      });
      expect(result).toEqual({ total: 3 });
    });

    it('should pass an abort signal', async () => {
      const requestMock = jest.fn().mockResolvedValue({ status: 200, headers: {}, data: { total: 0 } });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);
      const controller = new AbortController();

      await api.count({ signal: controller.signal });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/voices/count',
        signal: controller.signal,
      });
    });
  });

  describe('get()', () => {
    it('should make a GET request with the voice ID string', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockVoiceData({ id: 'returned-id' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const voice = await api.get('returned-id');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/voices/returned-id',
      });
      expect(voice).toBeInstanceOf(SonioxVoice);
      expect(voice?.id).toBe('returned-id');
    });

    it('should accept a SonioxVoice instance and use its id', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockVoiceData({ id: 'existing-id' }),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);
      const existing = new SonioxVoice(createMockVoiceData({ id: 'existing-id' }), mockHttp);

      await api.get(existing);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/voices/existing-id',
      });
    });

    it('should return null on 404', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const voice = await api.get('non-existent-id');

      expect(voice).toBeNull();
    });
  });

  describe('recompute()', () => {
    it('should POST with an empty body when no model is provided', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockVoiceData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await api.recompute('voice-id');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/voices/voice-id/recompute',
        body: {},
      });
    });

    it('should POST with the model in the body when provided', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: createMockVoiceData(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const result = await api.recompute({ id: 'voice-id' }, { model: 'tts-rt-v2' });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/voices/voice-id/recompute',
        body: { model: 'tts-rt-v2' },
      });
      expect(result).toBeInstanceOf(SonioxVoice);
    });
  });

  describe('delete()', () => {
    it('should make a DELETE request with the voice ID string', async () => {
      const requestMock = jest.fn().mockResolvedValue({ status: 204, headers: {}, data: null });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await api.delete('voice-to-delete');

      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/voices/voice-to-delete',
      });
    });

    it('should succeed silently on 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await expect(api.delete('non-existent-id')).resolves.toBeUndefined();
    });

    it('should rethrow non-404 errors', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock500Error());
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await expect(api.delete('voice-id')).rejects.toBeInstanceOf(SonioxHttpError);
    });
  });

  describe('delete_all()', () => {
    it('should delete all voices across pages', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            voices: [createMockVoiceData({ id: 'voice-1' }), createMockVoiceData({ id: 'voice-2' })],
            next_page_cursor: null,
          },
        })
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null })
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null });

      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      await expect(api.delete_all()).resolves.toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(3);
    });

    it('should respect an abort signal and stop early', async () => {
      const requestMock = jest.fn().mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          voices: [createMockVoiceData({ id: 'voice-1' })],
          next_page_cursor: null,
        },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxVoicesAPI(mockHttp);

      const controller = new AbortController();
      controller.abort();

      await expect(api.delete_all({ signal: controller.signal })).rejects.toThrow();
      expect(requestMock).toHaveBeenCalledTimes(1);
    });
  });
});
