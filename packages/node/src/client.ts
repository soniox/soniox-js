import { resolveConnectionConfig } from '@soniox/core';

import { SonioxAuthAPI } from './async/auth.js';
import { SonioxFilesAPI } from './async/files.js';
import { SonioxModelsAPI } from './async/models.js';
import { SonioxSttApi } from './async/stt.js';
import { SonioxTtsApi } from './async/tts.js';
import { SonioxWebhooksAPI } from './async/webhooks.js';
import { FetchHttpClient } from './http/fetch-adapter.js';
import { SonioxRealtimeApi } from './realtime/index.js';
import type { SonioxNodeClientOptions } from './types/public/index.js';

/**
 * Soniox Node Client
 *
 * @example
 * ```typescript
 * import { SonioxNodeClient } from '@soniox/node';
 *
 * // Default (US) region
 * const client = new SonioxNodeClient({ api_key: 'your-api-key' });
 *
 * // EU region
 * const client = new SonioxNodeClient({ api_key: 'your-api-key', region: 'eu' });
 *
 * // REST TTS
 * const audio = await client.tts.generate({
 *   text: 'Hello',
 *   voice: 'Adrian',
 *   language: 'en',
 * });
 *
 * // WebSocket TTS
 * const stream = await client.realtime.tts({
 *   model: 'tts-rt-v1',
 *   voice: 'Adrian',
 *   language: 'en',
 *   audio_format: 'wav',
 * });
 * ```
 */
export class SonioxNodeClient {
  readonly files: SonioxFilesAPI;
  readonly stt: SonioxSttApi;
  readonly tts: SonioxTtsApi;
  readonly models: SonioxModelsAPI;
  readonly webhooks: SonioxWebhooksAPI;
  readonly auth: SonioxAuthAPI;
  readonly realtime: SonioxRealtimeApi;

  constructor(options: SonioxNodeClientOptions = {}) {
    const apiKey = options.api_key ?? process.env['SONIOX_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'Missing API key. Provide it via options.api_key or set the SONIOX_API_KEY environment variable.'
      );
    }

    const regionDefaults = resolveConnectionConfig({
      api_key: apiKey,
      region: options.region ?? process.env['SONIOX_REGION'],
      base_domain: options.base_domain ?? process.env['SONIOX_BASE_DOMAIN'],
      stt_defaults: options.stt_defaults,
      tts_defaults: options.tts_defaults,
    });

    const baseURL = options.base_url ?? process.env['SONIOX_API_BASE_URL'] ?? regionDefaults.api_domain;
    const http =
      options.http_client ??
      new FetchHttpClient({
        base_url: baseURL,
        default_headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

    this.files = new SonioxFilesAPI(http);
    this.stt = new SonioxSttApi(http, this.files);
    this.models = new SonioxModelsAPI(http);
    this.webhooks = new SonioxWebhooksAPI(this.stt);
    this.auth = new SonioxAuthAPI(http);

    const ttsApiUrl = options.tts_api_url ?? process.env['SONIOX_TTS_API_URL'] ?? regionDefaults.tts_api_url;
    this.tts = new SonioxTtsApi(apiKey, ttsApiUrl, http);

    const wsBaseUrl = options.realtime?.ws_base_url ?? process.env['SONIOX_WS_URL'] ?? regionDefaults.stt_ws_url;
    const ttsWsUrl = options.realtime?.tts_ws_url ?? process.env['SONIOX_TTS_WS_URL'] ?? regionDefaults.tts_ws_url;

    this.realtime = new SonioxRealtimeApi({
      api_key: apiKey,
      ws_base_url: wsBaseUrl,
      tts_ws_url: ttsWsUrl,
      stt_defaults: regionDefaults.stt_defaults,
      tts_defaults: regionDefaults.tts_defaults,
      tts_connection_options: options.realtime?.tts_connection_options,
      default_session_options: options.realtime?.default_session_options,
    });
  }
}
