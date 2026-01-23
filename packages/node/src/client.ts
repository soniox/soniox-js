import { SonioxAuthAPI } from "./async/auth.js";
import { SonioxFilesAPI } from "./async/files.js";
import { SonioxTranscribeAPI } from "./async/transcribe.js";
import { SonioxWebhooksAPI } from "./async/webhooks.js";
import { SONIOX_API_BASE_URL } from "./constants.js";
import { FetchHttpClient } from "./http/fetch-adapter.js";
import { SonioxRealtimeAPI } from "./realtime/index.js";
import type { SonioxNodeClientOptions } from "./types/public/index.js";

export class SonioxNodeClient {
  readonly files: SonioxFilesAPI;
  readonly transcribe: SonioxTranscribeAPI;
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
    this.transcribe = new SonioxTranscribeAPI(http);
    this.webhooks = new SonioxWebhooksAPI();
    this.auth = new SonioxAuthAPI(http);

    this.realtime = new SonioxRealtimeAPI();
  }
}
