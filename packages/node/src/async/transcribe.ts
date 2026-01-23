import type { HttpClient } from "../http/client.js";
import type { SonioxModel } from "../types/public/index.js";

export class SonioxTranscribeAPI {
    constructor(private http: HttpClient) {}

    async create(): Promise<void> {
        // TODO: Implement transcription creation
        throw new Error('Not implemented');
    }

    async get(): Promise<void> {
        // TODO: Implement transcription retrieval
        throw new Error('Not implemented');
    }

    async list(): Promise<void> {
        // TODO: Implement transcription listing
        throw new Error('Not implemented');
    }

    async wait(): Promise<void> {
        // TODO: Implement transcription wait
        throw new Error('Not implemented');
    }

    async delete(): Promise<void> {
        // TODO: Implement transcription deletion
        throw new Error('Not implemented');
    }

    /**
     * List of available models and their attributes.
     * @see https://soniox.com/docs/stt/api-reference/models/get_models
     * @returns List of available models and their attributes.
     */
    async getModels(): Promise<SonioxModel[]> {
        const response = await this.http.request<{ models: SonioxModel[] }>({
            method: 'GET',
            path: '/v1/models',
        });
        return response.data.models;
    }
}