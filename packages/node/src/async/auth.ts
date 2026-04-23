import type { HttpClient } from '../http/client.js';
import type { TemporaryApiKeyRequest, TemporaryApiKeyResponse } from '../types/public/index.js';

export class SonioxAuthAPI {
  constructor(private http: HttpClient) {}

  /**
   * Creates a temporary API key for client-side use.
   *
   * @param request - Request parameters for the temporary key
   * @param signal - Optional AbortSignal for cancellation
   * @returns The temporary API key response
   *
   * @example
   * ```typescript
   * const sttKey = await client.auth.createTemporaryKey({
   *   usage_type: 'transcribe_websocket',
   *   expires_in_seconds: 300,
   * });
   *
   * const ttsKey = await client.auth.createTemporaryKey({
   *   usage_type: 'tts_rt',
   *   expires_in_seconds: 300,
   * });
   * ```
   */
  async createTemporaryKey(request: TemporaryApiKeyRequest, signal?: AbortSignal): Promise<TemporaryApiKeyResponse> {
    if (
      !Number.isFinite(request.expires_in_seconds) ||
      request.expires_in_seconds < 1 ||
      request.expires_in_seconds > 3600
    ) {
      throw new Error('expires_in_seconds must be a finite number between 1 and 3600');
    }

    const response = await this.http.request<TemporaryApiKeyResponse>({
      method: 'POST',
      path: '/v1/auth/temporary-api-key',
      body: request,
      ...(signal && { signal }),
    });

    return response.data;
  }
}
