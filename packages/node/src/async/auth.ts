import type { HttpClient } from "src/http/client";

export class SonioxAuthAPI {
    constructor(private http: HttpClient) { }

    async createTemporaryKey() {
        const response = await this.http.request({
            method: 'POST',
            url: '/v1/auth/temporary-api-key',
            body: {
                usage_type: 'transcribe_websocket',
                expires_in: 1,
                client_reference_id: '',
            }
        });
    }
}