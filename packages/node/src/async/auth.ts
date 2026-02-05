import type { HttpClient } from '../http/client.js';
import type { TemporaryApiKeyRequest, TemporaryApiKeyResponse } from '../types/public/index.js';

export class SonioxAuthAPI {
  constructor(private http: HttpClient) {}

  async createTemporaryKey(request: TemporaryApiKeyRequest): Promise<TemporaryApiKeyResponse> {
    const response = await this.http.request<TemporaryApiKeyResponse>({
      method: 'POST',
      path: '/v1/auth/temporary-api-key',
      body: request,
    });

    return response.data;
  }
}
