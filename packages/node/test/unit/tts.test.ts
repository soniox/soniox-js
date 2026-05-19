import { SonioxTtsApi } from '../../src/async/tts';
import type { HttpClient } from '../../src/http';
import type { TtsModel } from '../../src/types/public';

const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

const createMockTtsModel = (overrides: Partial<TtsModel> = {}): TtsModel => ({
  id: 'tts-rt-v1',
  aliased_model_id: null,
  name: 'TTS v1',
  languages: [
    {
      code: 'en',
      name: 'English',
    },
  ],
  voices: [
    {
      id: 'Adrian',
      description: 'A deep, focused male voice.',
      gender: 'male',
    },
    {
      id: 'Neutral',
      description: 'A clear neutral voice.',
      gender: 'neutral',
    },
  ],
  ...overrides,
});

describe('SonioxTtsApi', () => {
  describe('listModels()', () => {
    it('should call GET on /v1/tts-models endpoint', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { models: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxTtsApi('test-api-key', 'https://tts-rt.soniox.com', mockHttp);

      await api.listModels();

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/tts-models',
      });
    });

    it('should return models with languages and voice metadata', async () => {
      const mockModels = [createMockTtsModel()];
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { models: mockModels },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxTtsApi('test-api-key', 'https://tts-rt.soniox.com', mockHttp);

      const result = await api.listModels();

      expect(result).toEqual(mockModels);
      expect(result[0]?.languages[0]).toEqual({ code: 'en', name: 'English' });
      expect(result[0]?.voices[0]).toEqual({
        id: 'Adrian',
        description: 'A deep, focused male voice.',
        gender: 'male',
      });
      expect(result[0]?.voices[1]?.gender).toBe('neutral');
    });

    it('should pass abort signal', async () => {
      const requestMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { models: [] },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxTtsApi('test-api-key', 'https://tts-rt.soniox.com', mockHttp);
      const controller = new AbortController();

      await api.listModels(controller.signal);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/tts-models',
        signal: controller.signal,
      });
    });
  });
});
