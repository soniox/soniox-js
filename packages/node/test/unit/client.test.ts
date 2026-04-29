import { RealtimeTtsConnection } from '@soniox/core';

import { SonioxNodeClient } from '../../src/client';

describe('SonioxNodeClient', () => {
  const API_KEY = 'test-api-key';

  describe('region support', () => {
    it('creates client with default (US) region when no region is specified', () => {
      const client = new SonioxNodeClient({ api_key: API_KEY });
      expect(client).toBeInstanceOf(SonioxNodeClient);
      expect(client.realtime).toBeDefined();
    });

    it('creates client with EU region', () => {
      const client = new SonioxNodeClient({ api_key: API_KEY, region: 'eu' });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });

    it('creates client with JP region', () => {
      const client = new SonioxNodeClient({ api_key: API_KEY, region: 'jp' });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });

    it('accepts unknown region by deriving URLs from {region}.soniox.com', () => {
      const client = new SonioxNodeClient({ api_key: API_KEY, region: 'asia' });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });

    it('explicit base_url takes precedence over region', () => {
      const client = new SonioxNodeClient({
        api_key: API_KEY,
        region: 'eu',
        base_url: 'https://custom-api.example.com',
      });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });

    it('explicit realtime.ws_base_url takes precedence over region', () => {
      const client = new SonioxNodeClient({
        api_key: API_KEY,
        region: 'jp',
        realtime: {
          ws_base_url: 'wss://custom-ws.example.com/transcribe-websocket',
        },
      });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });
  });

  describe('env variable fallback', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('reads API key from SONIOX_API_KEY env var', () => {
      process.env['SONIOX_API_KEY'] = 'env-api-key';
      const client = new SonioxNodeClient();
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });

    it('throws when no API key is available', () => {
      delete process.env['SONIOX_API_KEY'];
      expect(() => new SonioxNodeClient()).toThrow('Missing API key');
    });

    it('env SONIOX_API_BASE_URL takes precedence over region', () => {
      process.env['SONIOX_API_BASE_URL'] = 'https://env-api.example.com';
      const client = new SonioxNodeClient({ api_key: API_KEY, region: 'eu' });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });

    it('env SONIOX_WS_URL takes precedence over region', () => {
      process.env['SONIOX_WS_URL'] = 'wss://env-ws.example.com/transcribe-websocket';
      const client = new SonioxNodeClient({ api_key: API_KEY, region: 'jp' });
      expect(client).toBeInstanceOf(SonioxNodeClient);
    });
  });

  describe('stt_defaults / tts_defaults passthrough', () => {
    it('merges stt_defaults into sessions created via realtime.stt()', () => {
      const client = new SonioxNodeClient({
        api_key: API_KEY,
        stt_defaults: { model: 'stt-rt-v4', language_hints: ['en', 'de'] },
      });
      const session = client.realtime.stt({ enable_language_identification: true });
      const config = (session as unknown as { config: Record<string, unknown> }).config;
      expect(config).toEqual({
        model: 'stt-rt-v4',
        language_hints: ['en', 'de'],
        enable_language_identification: true,
      });
    });

    it('caller-provided fields override stt_defaults', () => {
      const client = new SonioxNodeClient({
        api_key: API_KEY,
        stt_defaults: { model: 'stt-rt-v4' },
      });
      const session = client.realtime.stt({ model: 'stt-rt-v5' });
      const config = (session as unknown as { config: { model: string } }).config;
      expect(config.model).toBe('stt-rt-v5');
    });

    it('forwards tts_defaults into the TTS multi-stream connection', async () => {
      const ttsDefaults = { model: 'tts-rt-v1', voice: 'Adrian', language: 'en', audio_format: 'mp3' };
      const client = new SonioxNodeClient({
        api_key: API_KEY,
        tts_defaults: ttsDefaults,
      });

      const connectSpy = jest.spyOn(RealtimeTtsConnection.prototype, 'connect').mockResolvedValue(undefined);

      try {
        const connection = await client.realtime.tts.multiStream();
        const actual = (connection as unknown as { ttsDefaults: Record<string, unknown> }).ttsDefaults;
        expect(actual).toEqual(ttsDefaults);
      } finally {
        connectSpy.mockRestore();
      }
    });
  });
});
