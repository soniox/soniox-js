import { SonioxAuthAPI } from "./async/auth";
import { SonioxFilesAPI } from "./async/files";
import { SonioxTranscribeAPI } from "./async/transcribe";
import { SonioxWebhooksAPI } from "./async/webhooks";
import { SONIOX_API_BASE_URL } from "./constants";
import type { HttpClient } from "./http/client";
import { FetchHttpClient } from "./http/fetch-adapter";
import { SonioxRealtimeAPI } from "./realtime";

export interface SonioxNodeClientOptions {
  apiKey: string;

  baseURL?: string;
  httpClient?: HttpClient;
}

export class SonioxNodeClient {
  readonly files: SonioxFilesAPI;
  readonly transcribe: SonioxTranscribeAPI;
  readonly webhooks: SonioxWebhooksAPI;
  readonly auth: SonioxAuthAPI;
  readonly realtime: SonioxRealtimeAPI;

  constructor(options: SonioxNodeClientOptions) {
    const baseURL = options.baseURL ?? SONIOX_API_BASE_URL;
    const http = options.httpClient ?? new FetchHttpClient({
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    });

    this.files = new SonioxFilesAPI(http);
    this.transcribe = new SonioxTranscribeAPI(http);
    this.webhooks = new SonioxWebhooksAPI();
    this.auth = new SonioxAuthAPI(http);

    this.realtime = new SonioxRealtimeAPI();
  }
}
