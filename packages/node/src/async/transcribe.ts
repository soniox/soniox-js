import type { HttpClient } from "../http/client.js";

export class SonioxTranscriptionsAPI {
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
}