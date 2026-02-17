import { SonioxAuthAPI } from '../../src/async/auth';
import type { HttpClient } from '../../src/http/client';
import type { TemporaryApiKeyResponse } from '../../src/types/public';

function createMockHttpClient(requestMock?: jest.Mock): HttpClient {
  return {
    request: requestMock ?? jest.fn(),
  } as unknown as HttpClient;
}

function createMockTemporaryKeyResponse(): TemporaryApiKeyResponse {
  return {
    api_key: 'temp-key-123',
    expires_at: '2024-11-26T01:00:00Z',
  };
}

describe('SonioxAuthAPI', () => {
  describe('createTemporaryKey()', () => {
    it('should make POST request with valid expires_in_seconds', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTemporaryKeyResponse(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxAuthAPI(mockHttp);

      await api.createTemporaryKey({
        expires_in_seconds: 3600,
        usage_type: 'transcribe_websocket',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'POST',
        path: '/v1/auth/temporary-api-key',
        body: { expires_in_seconds: 3600, usage_type: 'transcribe_websocket' },
      });
    });

    it('should return TemporaryApiKeyResponse', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: createMockTemporaryKeyResponse(),
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxAuthAPI(mockHttp);

      const result = await api.createTemporaryKey({
        expires_in_seconds: 60,
        usage_type: 'transcribe_websocket',
      });

      expect(result.api_key).toBe('temp-key-123');
      expect(result.expires_at).toBe('2024-11-26T01:00:00Z');
    });

    describe('expires_in_seconds validation', () => {
      it('should reject expires_in_seconds less than 1', async () => {
        const mockHttp = createMockHttpClient();
        const api = new SonioxAuthAPI(mockHttp);

        await expect(
          api.createTemporaryKey({
            expires_in_seconds: 0,
            usage_type: 'transcribe_websocket',
          })
        ).rejects.toThrow('expires_in_seconds must be a finite number between 1 and 3600');
      });

      it('should reject negative expires_in_seconds', async () => {
        const mockHttp = createMockHttpClient();
        const api = new SonioxAuthAPI(mockHttp);

        await expect(
          api.createTemporaryKey({
            expires_in_seconds: -1,
            usage_type: 'transcribe_websocket',
          })
        ).rejects.toThrow('expires_in_seconds must be a finite number between 1 and 3600');
      });

      it('should reject expires_in_seconds greater than 3600', async () => {
        const mockHttp = createMockHttpClient();
        const api = new SonioxAuthAPI(mockHttp);

        await expect(
          api.createTemporaryKey({
            expires_in_seconds: 3601,
            usage_type: 'transcribe_websocket',
          })
        ).rejects.toThrow('expires_in_seconds must be a finite number between 1 and 3600');
      });

      it('should accept expires_in_seconds at minimum (1)', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTemporaryKeyResponse(),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxAuthAPI(mockHttp);

        await api.createTemporaryKey({
          expires_in_seconds: 1,
          usage_type: 'transcribe_websocket',
        });

        expect(requestMock).toHaveBeenCalled();
      });

      it('should accept expires_in_seconds at maximum (3600)', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: createMockTemporaryKeyResponse(),
        });
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxAuthAPI(mockHttp);

        await api.createTemporaryKey({
          expires_in_seconds: 3600,
          usage_type: 'transcribe_websocket',
        });

        expect(requestMock).toHaveBeenCalled();
      });
    });
  });
});
