import type { HttpClient, HttpRequestConfig, HttpResponse } from "./client";

export class FetchHttpClient implements HttpClient {
    constructor(private defaultHeaders: Record<string, string>) {}

    async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {}
}