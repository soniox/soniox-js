export type HttpRequestConfig = {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
}

export type HttpResponse<T> = {
    status: number;
    headers: Record<string, string>;
    data: T;
}

export type HttpClient = {
    request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
}