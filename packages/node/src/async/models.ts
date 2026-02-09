import type { HttpClient } from '../http/client.js';
import type { SonioxModel } from '../types/public/index.js';

export class SonioxModelsAPI {
  constructor(private http: HttpClient) {}

  /**
   * List of available models and their attributes.
   * @see https://soniox.com/docs/stt/api-reference/models/get_models
   * @param signal - Optional AbortSignal for cancellation
   * @returns List of available models and their attributes.
   */
  async list(signal?: AbortSignal): Promise<SonioxModel[]> {
    const response = await this.http.request<{ models: SonioxModel[] }>({
      method: 'GET',
      path: '/v1/models',
      ...(signal && { signal }),
    });
    return response.data.models;
  }
}
