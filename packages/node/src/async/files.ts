import type { HttpClient } from "../http/client.js";

export class SonioxFilesAPI {
    constructor(private http: HttpClient) {}

    async upload(): Promise<void> {
        // TODO: Implement file upload
        void this.http;
        throw new Error('Not implemented');
    }

    async list(): Promise<void> {
        // TODO: Implement file listing
        throw new Error('Not implemented');
    }

    async get(): Promise<void> {
        // TODO: Implement file retrieval
        throw new Error('Not implemented');
    }

    async delete(): Promise<void> {
        // TODO: Implement file deletion
        throw new Error('Not implemented');
    }
}