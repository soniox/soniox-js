import type { HttpClient } from "src/http/client";

export class SonioxTranscribeAPI {
    constructor(private http: HttpClient) {

    }

    async create() {}

    async get() {}

    async list() {}

    async wait() {}

    async delete() {}

    /**
     * List of available models and their attributes.
     * @see https://soniox.com/docs/stt/api-reference/models/get_models
     * @returns List of available models and their attributes.
     */
    async getModels() {}
}