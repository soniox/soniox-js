import { SonioxError } from '@soniox/core';

import { SonioxClient } from '../../src/client';

/**
 * The low-level `client.realtime.stt()` factory used to ignore the configured
 * region — it always fell back to the default US endpoint. The
 * client now pre-resolves URLs at construction when `config` is a plain object,
 * and throws a clear error when the config is async and no `ws_base_url` was
 * provided.
 */

function wsBaseUrlOf(session: unknown): string {
  return (session as { wsBaseUrl: string }).wsBaseUrl;
}

describe('SonioxClient.realtime.stt() region handling', () => {
  it('honors a sync `config` with region for the low-level factory', () => {
    const client = new SonioxClient({ config: { api_key: 'tmp-key', region: 'eu' } });
    const session = client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: 'tmp-key' });
    expect(wsBaseUrlOf(session)).toBe('wss://stt-rt.eu.soniox.com/transcribe-websocket');
  });

  it('honors a sync `config` with base_domain for the low-level factory', () => {
    const client = new SonioxClient({ config: { api_key: 'tmp-key', base_domain: 'custom.example.com' } });
    const session = client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: 'tmp-key' });
    expect(wsBaseUrlOf(session)).toBe('wss://stt-rt.custom.example.com/transcribe-websocket');
  });

  it('falls back to the default US URL when no region is configured', () => {
    const client = new SonioxClient({ config: { api_key: 'tmp-key' } });
    const session = client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: 'tmp-key' });
    expect(wsBaseUrlOf(session)).toBe('wss://stt-rt.soniox.com/transcribe-websocket');
  });

  it('prefers `ws_base_url` when set on the client', () => {
    const client = new SonioxClient({
      config: { api_key: 'tmp-key', region: 'eu' },
      ws_base_url: 'wss://custom.example.com/transcribe-websocket',
    });
    const session = client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: 'tmp-key' });
    expect(wsBaseUrlOf(session)).toBe('wss://custom.example.com/transcribe-websocket');
  });

  it('throws a SonioxError when async config is used without `ws_base_url`', () => {
    const client = new SonioxClient({ config: async () => ({ api_key: 'tmp-key', region: 'eu' }) });
    expect(() => client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: 'tmp-key' })).toThrow(SonioxError);
  });

  it('accepts async config when `ws_base_url` is explicitly provided', () => {
    const client = new SonioxClient({
      config: async () => ({ api_key: 'tmp-key', region: 'eu' }),
      ws_base_url: 'wss://stt-rt.eu.soniox.com/transcribe-websocket',
    });
    const session = client.realtime.stt({ model: 'stt-rt-v4' }, { api_key: 'tmp-key' });
    expect(wsBaseUrlOf(session)).toBe('wss://stt-rt.eu.soniox.com/transcribe-websocket');
  });
});
