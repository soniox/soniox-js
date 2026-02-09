import { SonioxModelsAPI } from '../../src/async/models';
import type { HttpClient } from '../../src/http';

// Helper to create a mock HttpClient
const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

describe('SonioxModelsAPI', () => {
  describe('list()', () => {
    it('should call GET on /v1/models endpoint', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { models: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxModelsAPI(mockHttp);

      await api.list();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/models',
      });
    });

    it('should return models from response', async () => {
      const mockModels = [{ id: 'model-1' }, { id: 'model-2' }];
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { models: mockModels },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxModelsAPI(mockHttp);

      const result = await api.list();

      expect(result).toEqual(mockModels);
    });

    it('should propagate HTTP errors', async () => {
      const requestMock = jest.fn().mockRejectedValue(new Error('Network error'));
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxModelsAPI(mockHttp);

      await expect(api.list()).rejects.toThrow('Network error');
    });
  });
});
