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

    it('throws on unknown region without explicit URLs', () => {
      expect(() => new SonioxNodeClient({ api_key: API_KEY, region: 'asia' })).toThrow("Unknown region 'asia'");
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
});
