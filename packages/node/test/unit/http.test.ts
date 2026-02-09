import { FetchHttpClient, SonioxHttpError, buildUrl, mergeHeaders, normalizeHeaders } from '../../src/http';

describe('FetchHttpClient', () => {
  const createMockFetch = (response: Partial<Response>) => {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({})),
      json: () => Promise.resolve({}),
      ...response,
    }) as jest.Mock & typeof fetch;
  };

  it('should make a GET request', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve(JSON.stringify({ message: 'ok' })),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    const response = await client.request<{ message: string }>({
      method: 'GET',
      path: '/test',
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ message: 'ok' });
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/test', expect.objectContaining({ method: 'GET' }));
  });

  it('should make a POST request with JSON body', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve(JSON.stringify({ id: 123 })),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    await client.request({
      method: 'POST',
      path: '/items',
      body: { name: 'test' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      })
    );
  });

  it('should include query parameters in URL', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve('[]'),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    await client.request({
      method: 'GET',
      path: '/items',
      query: { page: 1, limit: 10 },
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items?page=1&limit=10', expect.anything());
  });

  it('should merge default headers with request headers', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve('{}'),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      default_headers: { authorization: 'Bearer token' },
      fetch: mockFetch,
    });

    await client.request({
      method: 'GET',
      path: '/test',
      headers: { 'x-custom': 'value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer token',
          'x-custom': 'value',
        }),
      })
    );
  });

  it('should throw SonioxHttpError on non-2xx response', async () => {
    const mockFetch = createMockFetch({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    await expect(client.request({ method: 'GET', path: '/missing' })).rejects.toThrow(SonioxHttpError);

    try {
      await client.request({ method: 'GET', path: '/missing' });
    } catch (err) {
      expect(err).toBeInstanceOf(SonioxHttpError);
      const httpError = err as SonioxHttpError;
      expect(httpError.code).toBe('http_error');
      expect(httpError.statusCode).toBe(404);
    }
  });

  it('should handle 204 No Content response', async () => {
    const mockFetch = createMockFetch({
      status: 204,
      headers: new Headers({ 'content-length': '0' }),
      text: () => Promise.resolve(''),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    const response = await client.request({
      method: 'DELETE',
      path: '/items/123',
    });

    expect(response.status).toBe(204);
    expect(response.data).toBeNull();
  });

  it('should return text when responseType is text', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve('Hello, World!'),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    const response = await client.request<string>({
      method: 'GET',
      path: '/text',
      responseType: 'text',
    });

    expect(response.data).toBe('Hello, World!');
  });

  it('should call onRequest and onResponse hooks', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve('{}'),
    });

    const onRequest = jest.fn();
    const onResponse = jest.fn();

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
      hooks: { onRequest, onResponse },
    });

    await client.request({ method: 'GET', path: '/test' });

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/test' }),
      expect.objectContaining({ url: 'https://api.example.com/test', method: 'GET' })
    );

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      expect.objectContaining({ durationMs: expect.any(Number) })
    );
  });

  it('should call onError hook on failure', async () => {
    const mockFetch = createMockFetch({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server Error'),
    });

    const onError = jest.fn();

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
      hooks: { onError },
    });

    await expect(client.request({ method: 'GET', path: '/error' })).rejects.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(SonioxHttpError),
      expect.objectContaining({ durationMs: expect.any(Number) })
    );
  });

  it('should throw parse error on invalid JSON', async () => {
    const mockFetch = createMockFetch({
      text: () => Promise.resolve('not valid json'),
    });

    const client = new FetchHttpClient({
      base_url: 'https://api.example.com',
      fetch: mockFetch,
    });

    try {
      await client.request({ method: 'GET', path: '/bad-json' });
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SonioxHttpError);
      const httpError = err as SonioxHttpError;
      expect(httpError.code).toBe('parse_error');
      expect(httpError.bodyText).toBe('not valid json');
    }
  });
});

describe('buildUrl', () => {
  it('should join base URL and path', () => {
    expect(buildUrl('https://api.example.com', '/users')).toBe('https://api.example.com/users');
    expect(buildUrl('https://api.example.com/', '/users')).toBe('https://api.example.com/users');
    expect(buildUrl('https://api.example.com', 'users')).toBe('https://api.example.com/users');
  });

  it('should append query parameters', () => {
    expect(buildUrl('https://api.example.com', '/users', { page: 1 })).toBe('https://api.example.com/users?page=1');
  });

  it('should skip undefined query values', () => {
    expect(buildUrl('https://api.example.com', '/users', { page: 1, filter: undefined })).toBe(
      'https://api.example.com/users?page=1'
    );
  });

  it('should handle empty base URL', () => {
    expect(buildUrl(undefined, '/users')).toBe('/users');
  });

  it('should preserve absolute URLs in path', () => {
    expect(buildUrl('https://api.example.com', 'https://other.com/path')).toBe('https://other.com/path');
  });
});

describe('mergeHeaders', () => {
  it('should merge multiple header objects', () => {
    const result = mergeHeaders({ 'content-type': 'application/json' }, { authorization: 'Bearer token' });
    expect(result).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer token',
    });
  });

  it('should normalize keys to lowercase', () => {
    const result = mergeHeaders({ 'Content-Type': 'application/json' }, { Authorization: 'Bearer token' });
    expect(result).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer token',
    });
  });

  it('should override earlier values with later ones', () => {
    const result = mergeHeaders({ authorization: 'Bearer old' }, { Authorization: 'Bearer new' });
    expect(result).toEqual({ authorization: 'Bearer new' });
  });

  it('should skip undefined objects', () => {
    const result = mergeHeaders({ 'content-type': 'application/json' }, undefined, { authorization: 'Bearer token' });
    expect(result).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer token',
    });
  });
});

describe('normalizeHeaders', () => {
  it('should convert Headers to lowercase object', () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
    });
    const result = normalizeHeaders(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'value',
    });
  });
});

describe('SonioxHttpError', () => {
  it('should have correct properties', () => {
    const error = new SonioxHttpError({
      code: 'http_error',
      message: 'Not Found',
      url: 'https://api.example.com/missing',
      method: 'GET',
      statusCode: 404,
    });

    expect(error.name).toBe('SonioxHttpError');
    expect(error.code).toBe('http_error');
    expect(error.message).toBe('Not Found');
    expect(error.url).toBe('https://api.example.com/missing');
    expect(error.method).toBe('GET');
    expect(error.statusCode).toBe(404);
  });

  it('should be instanceof Error', () => {
    const error = new SonioxHttpError({
      code: 'network_error',
      message: 'Connection failed',
      url: 'https://api.example.com',
      method: 'GET',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SonioxHttpError);
  });

  it('should serialize to JSON', () => {
    const error = new SonioxHttpError({
      code: 'http_error',
      message: 'Bad Request',
      url: 'https://api.example.com/data',
      method: 'POST',
      statusCode: 400,
      bodyText: '{"error": "invalid"}',
    });

    const json = error.toJSON();
    expect(json).toEqual({
      name: 'SonioxHttpError',
      code: 'http_error',
      message: 'Bad Request',
      url: 'https://api.example.com/data',
      method: 'POST',
      statusCode: 400,
      bodyText: '{"error": "invalid"}',
    });
  });
});
