import { resolveConnectionConfig } from '@soniox/core';

describe('resolveConnectionConfig', () => {
  const apiKey = 'test-api-key';

  describe('default region (undefined)', () => {
    it('should resolve to US defaults when no region is specified', () => {
      const result = resolveConnectionConfig({ api_key: apiKey });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.soniox.com',
        stt_ws_url: 'wss://stt-rt.soniox.com/transcribe-websocket',
        session_defaults: {},
      });
    });
  });

  describe('known regions', () => {
    it('should resolve EU region', () => {
      const result = resolveConnectionConfig({ api_key: apiKey, region: 'eu' });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.eu.soniox.com',
        stt_ws_url: 'wss://stt-rt.eu.soniox.com/transcribe-websocket',
        session_defaults: {},
      });
    });

    it('should resolve JP region', () => {
      const result = resolveConnectionConfig({ api_key: apiKey, region: 'jp' });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.jp.soniox.com',
        stt_ws_url: 'wss://stt-rt.jp.soniox.com/transcribe-websocket',
        session_defaults: {},
      });
    });
  });

  describe('explicit URL overrides', () => {
    it('should use explicit api_domain over region default', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'eu',
        api_domain: 'https://custom-api.example.com',
      });

      expect(result.api_domain).toBe('https://custom-api.example.com');
      expect(result.stt_ws_url).toBe('wss://stt-rt.eu.soniox.com/transcribe-websocket');
    });

    it('should use explicit stt_ws_url over region default', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'eu',
        stt_ws_url: 'wss://custom-ws.example.com/transcribe-websocket',
      });

      expect(result.api_domain).toBe('https://api.eu.soniox.com');
      expect(result.stt_ws_url).toBe('wss://custom-ws.example.com/transcribe-websocket');
    });

    it('should use both explicit overrides over region defaults', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'jp',
        api_domain: 'https://custom-api.example.com',
        stt_ws_url: 'wss://custom-ws.example.com/transcribe-websocket',
      });

      expect(result.api_domain).toBe('https://custom-api.example.com');
      expect(result.stt_ws_url).toBe('wss://custom-ws.example.com/transcribe-websocket');
    });

    it('should use explicit overrides with default region', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        api_domain: 'https://custom-api.example.com',
        stt_ws_url: 'wss://custom-ws.example.com/transcribe-websocket',
      });

      expect(result.api_domain).toBe('https://custom-api.example.com');
      expect(result.stt_ws_url).toBe('wss://custom-ws.example.com/transcribe-websocket');
    });
  });

  describe('unknown regions', () => {
    it('should accept an unknown region when both explicit URLs are provided', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'asia',
        api_domain: 'https://api.asia.soniox.com',
        stt_ws_url: 'wss://stt-rt.asia.soniox.com/transcribe-websocket',
      });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.asia.soniox.com',
        stt_ws_url: 'wss://stt-rt.asia.soniox.com/transcribe-websocket',
        session_defaults: {},
      });
    });

    it('should throw when unknown region is used without explicit URLs', () => {
      expect(() => resolveConnectionConfig({ api_key: apiKey, region: 'asia' })).toThrow(
        "Unknown region 'asia'. Provide api_domain and stt_ws_url explicitly, or upgrade the SDK."
      );
    });

    it('should throw when unknown region is used with only api_domain', () => {
      expect(() =>
        resolveConnectionConfig({
          api_key: apiKey,
          region: 'asia',
          api_domain: 'https://api.asia.soniox.com',
        })
      ).toThrow("Unknown region 'asia'. Provide stt_ws_url explicitly, or upgrade the SDK.");
    });

    it('should throw when unknown region is used with only stt_ws_url', () => {
      expect(() =>
        resolveConnectionConfig({
          api_key: apiKey,
          region: 'asia',
          stt_ws_url: 'wss://stt-rt.asia.soniox.com/transcribe-websocket',
        })
      ).toThrow("Unknown region 'asia'. Provide api_domain explicitly, or upgrade the SDK.");
    });
  });

  describe('api_key passthrough', () => {
    it('should always pass through api_key unchanged', () => {
      const key = 'my-secret-key-123';
      const result = resolveConnectionConfig({ api_key: key, region: 'eu' });
      expect(result.api_key).toBe(key);
    });
  });

  describe('session_defaults', () => {
    it('should default to empty object when not provided', () => {
      const result = resolveConnectionConfig({ api_key: apiKey });
      expect(result.session_defaults).toEqual({});
    });

    it('should pass through session_defaults when provided', () => {
      const defaults = { model: 'stt-rt-v5', language_hints: ['en', 'de'] };
      const result = resolveConnectionConfig({ api_key: apiKey, session_defaults: defaults });
      expect(result.session_defaults).toEqual(defaults);
    });

    it('should pass through session_defaults with region', () => {
      const defaults = { model: 'stt-rt-v5', enable_endpoint_detection: true };
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'eu',
        session_defaults: defaults,
      });
      expect(result.session_defaults).toEqual(defaults);
      expect(result.api_domain).toBe('https://api.eu.soniox.com');
    });
  });
});
