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
        tts_api_url: 'https://tts-rt.soniox.com',
        tts_ws_url: 'wss://tts-rt.soniox.com/tts-websocket',
        stt_defaults: {},
        tts_defaults: {},
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
        tts_api_url: 'https://tts-rt.eu.soniox.com',
        tts_ws_url: 'wss://tts-rt.eu.soniox.com/tts-websocket',
        stt_defaults: {},
        tts_defaults: {},
        session_defaults: {},
      });
    });

    it('should resolve JP region', () => {
      const result = resolveConnectionConfig({ api_key: apiKey, region: 'jp' });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.jp.soniox.com',
        stt_ws_url: 'wss://stt-rt.jp.soniox.com/transcribe-websocket',
        tts_api_url: 'https://tts-rt.jp.soniox.com',
        tts_ws_url: 'wss://tts-rt.jp.soniox.com/tts-websocket',
        stt_defaults: {},
        tts_defaults: {},
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

  describe("region: 'us'", () => {
    it("treats region: 'us' as equivalent to region: undefined (default US)", () => {
      const fromUs = resolveConnectionConfig({ api_key: apiKey, region: 'us' });
      const fromUndefined = resolveConnectionConfig({ api_key: apiKey });

      expect(fromUs).toEqual(fromUndefined);
      expect(fromUs.api_domain).toBe('https://api.soniox.com');
      expect(fromUs.stt_ws_url).toBe('wss://stt-rt.soniox.com/transcribe-websocket');
      expect(fromUs.tts_api_url).toBe('https://tts-rt.soniox.com');
      expect(fromUs.tts_ws_url).toBe('wss://tts-rt.soniox.com/tts-websocket');
    });

    it("normalizes region: 'US' (case-insensitive) to default US", () => {
      const result = resolveConnectionConfig({ api_key: apiKey, region: 'US' });
      expect(result.api_domain).toBe('https://api.soniox.com');
      expect(result.stt_ws_url).toBe('wss://stt-rt.soniox.com/transcribe-websocket');
    });

    it("still honors base_domain when region is 'us'", () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'us',
        base_domain: 'custom.example.com',
      });
      expect(result.api_domain).toBe('https://api.custom.example.com');
    });
  });

  describe('unknown regions', () => {
    it('should derive URLs from unknown region name', () => {
      const result = resolveConnectionConfig({ api_key: apiKey, region: 'asia' });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.asia.soniox.com',
        stt_ws_url: 'wss://stt-rt.asia.soniox.com/transcribe-websocket',
        tts_api_url: 'https://tts-rt.asia.soniox.com',
        tts_ws_url: 'wss://tts-rt.asia.soniox.com/tts-websocket',
        stt_defaults: {},
        tts_defaults: {},
        session_defaults: {},
      });
    });

    it('should allow individual overrides on top of an unknown region', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'asia',
        api_domain: 'https://custom-api.example.com',
      });

      expect(result.api_domain).toBe('https://custom-api.example.com');
      expect(result.stt_ws_url).toBe('wss://stt-rt.asia.soniox.com/transcribe-websocket');
    });
  });

  describe('base_domain', () => {
    it('should derive all URLs from base_domain', () => {
      const result = resolveConnectionConfig({ api_key: apiKey, base_domain: 'custom.example.com' });

      expect(result).toEqual({
        api_key: apiKey,
        api_domain: 'https://api.custom.example.com',
        stt_ws_url: 'wss://stt-rt.custom.example.com/transcribe-websocket',
        tts_api_url: 'https://tts-rt.custom.example.com',
        tts_ws_url: 'wss://tts-rt.custom.example.com/tts-websocket',
        stt_defaults: {},
        tts_defaults: {},
        session_defaults: {},
      });
    });

    it('should take precedence over region', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        region: 'eu',
        base_domain: 'custom.example.com',
      });

      expect(result.api_domain).toBe('https://api.custom.example.com');
      expect(result.stt_ws_url).toBe('wss://stt-rt.custom.example.com/transcribe-websocket');
    });

    it('should allow individual URL overrides on top of base_domain', () => {
      const result = resolveConnectionConfig({
        api_key: apiKey,
        base_domain: 'custom.example.com',
        stt_ws_url: 'wss://custom-ws.example.com/transcribe-websocket',
      });

      expect(result.api_domain).toBe('https://api.custom.example.com');
      expect(result.stt_ws_url).toBe('wss://custom-ws.example.com/transcribe-websocket');
      expect(result.tts_api_url).toBe('https://tts-rt.custom.example.com');
    });

    it('region shorthand is equivalent to setting base_domain to {region}.soniox.com', () => {
      const fromRegion = resolveConnectionConfig({ api_key: apiKey, region: 'eu' });
      const fromBase = resolveConnectionConfig({ api_key: apiKey, base_domain: 'eu.soniox.com' });

      expect(fromRegion.api_domain).toBe(fromBase.api_domain);
      expect(fromRegion.stt_ws_url).toBe(fromBase.stt_ws_url);
      expect(fromRegion.tts_api_url).toBe(fromBase.tts_api_url);
      expect(fromRegion.tts_ws_url).toBe(fromBase.tts_ws_url);
    });
  });

  describe('api_key passthrough', () => {
    it('should always pass through api_key unchanged', () => {
      const key = 'my-secret-key-123';
      const result = resolveConnectionConfig({ api_key: key, region: 'eu' });
      expect(result.api_key).toBe(key);
    });
  });

  describe('stt_defaults / session_defaults', () => {
    it('should default to empty object when not provided', () => {
      const result = resolveConnectionConfig({ api_key: apiKey });
      expect(result.stt_defaults).toEqual({});
      expect(result.session_defaults).toEqual({});
    });

    it('should use stt_defaults when provided', () => {
      const defaults = { model: 'stt-rt-v5', language_hints: ['en', 'de'] };
      const result = resolveConnectionConfig({ api_key: apiKey, stt_defaults: defaults });
      expect(result.stt_defaults).toEqual(defaults);
      expect(result.session_defaults).toEqual(defaults);
    });

    it('should fall back to deprecated session_defaults', () => {
      const defaults = { model: 'stt-rt-v5' };
      const result = resolveConnectionConfig({ api_key: apiKey, session_defaults: defaults });
      expect(result.stt_defaults).toEqual(defaults);
      expect(result.session_defaults).toEqual(defaults);
    });

    it('stt_defaults takes precedence over session_defaults', () => {
      const sttDefaults = { model: 'stt-rt-v5' };
      const sessionDefaults = { model: 'stt-rt-v4' };
      const result = resolveConnectionConfig({
        api_key: apiKey,
        stt_defaults: sttDefaults,
        session_defaults: sessionDefaults,
      });
      expect(result.stt_defaults).toEqual(sttDefaults);
    });
  });

  describe('tts_defaults', () => {
    it('should default to empty object when not provided', () => {
      const result = resolveConnectionConfig({ api_key: apiKey });
      expect(result.tts_defaults).toEqual({});
    });

    it('should pass through tts_defaults when provided', () => {
      const defaults = { model: 'tts-rt-v1', voice: 'Adrian' };
      const result = resolveConnectionConfig({ api_key: apiKey, tts_defaults: defaults });
      expect(result.tts_defaults).toEqual(defaults);
    });
  });
});
