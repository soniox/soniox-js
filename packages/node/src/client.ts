import { SonioxAuthAPI } from "./async/auth.js";
import { SonioxFilesAPI } from "./async/files.js";
import { SonioxModelsAPI } from "./async/models.js";
import { SonioxSttApi } from "./async/stt.js";
import { SonioxWebhooksAPI } from "./async/webhooks.js";
import { SONIOX_API_BASE_URL, SONIOX_API_WS_URL } from "./constants.js";
import { FetchHttpClient } from "./http/fetch-adapter.js";
import { SonioxRealtimeAPI } from "./realtime/index.js";
import type { SonioxNodeClientOptions } from "./types/public/index.js";

export class SonioxNodeClient {
  readonly files: SonioxFilesAPI;
  readonly stt: SonioxSttApi;
  readonly models: SonioxModelsAPI;
  readonly webhooks: SonioxWebhooksAPI;
  readonly auth: SonioxAuthAPI;
  readonly realtime: SonioxRealtimeAPI;

  constructor(options: SonioxNodeClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env['SONIOX_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'Missing API key. Provide it via options.apiKey or set the SONIOX_API_KEY environment variable.'
      );
    }

    const baseURL = options.baseURL ?? process.env['SONIOX_API_BASE_URL'] ?? SONIOX_API_BASE_URL;
    const http = options.httpClient ?? new FetchHttpClient({
      baseUrl: baseURL,
      defaultHeaders: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    this.files = new SonioxFilesAPI(http);
    this.stt = new SonioxSttApi(http, this.files);
    this.models = new SonioxModelsAPI(http);
    this.webhooks = new SonioxWebhooksAPI(this.stt);
    this.auth = new SonioxAuthAPI(http);

    // Configure realtime API with user options or defaults
    const realtimeWsUrl =
      options.realtime?.baseURL ??
      process.env['SONIOX_WS_URL'] ??
      SONIOX_API_WS_URL;

    const realtimeApiKey = options.realtime?.apiKey ?? apiKey;
    const realtimeDefaultOptions = options.realtime?.defaultSessionOptions;

    this.realtime = new SonioxRealtimeAPI({
      api_key: realtimeApiKey,
      base_url: realtimeWsUrl,
      ...(realtimeDefaultOptions && { default_session_options: realtimeDefaultOptions }),
    });
  }
}
