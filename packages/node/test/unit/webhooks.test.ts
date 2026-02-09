import {
  isWebhookEvent,
  parseWebhookEvent,
  verifyWebhookAuth,
  handleWebhook,
  handleWebhookRequest,
  getWebhookAuthFromEnv,
  SonioxWebhooksAPI,
  type WebhookEvent,
  type WebhookAuthConfig,
} from '../../src/async/webhooks';
import { SONIOX_API_WEBHOOK_HEADER_ENV, SONIOX_API_WEBHOOK_SECRET_ENV } from '../../src/constants';

describe('isWebhookEvent', () => {
  it('should return true for valid completed event', () => {
    const event = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'completed' };
    expect(isWebhookEvent(event)).toBe(true);
  });

  it('should return true for valid error event', () => {
    const event = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'error' };
    expect(isWebhookEvent(event)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isWebhookEvent(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isWebhookEvent(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isWebhookEvent('string')).toBe(false);
    expect(isWebhookEvent(123)).toBe(false);
    expect(isWebhookEvent(true)).toBe(false);
  });

  it('should return false for missing id', () => {
    expect(isWebhookEvent({ status: 'completed' })).toBe(false);
  });

  it('should return false for empty id', () => {
    expect(isWebhookEvent({ id: '', status: 'completed' })).toBe(false);
  });

  it('should return false for non-string id', () => {
    expect(isWebhookEvent({ id: 123, status: 'completed' })).toBe(false);
  });

  it('should return false for missing status', () => {
    expect(isWebhookEvent({ id: '123' })).toBe(false);
  });

  it('should return false for invalid status', () => {
    expect(isWebhookEvent({ id: '123', status: 'pending' })).toBe(false);
    expect(isWebhookEvent({ id: '123', status: 'processing' })).toBe(false);
    expect(isWebhookEvent({ id: '123', status: '' })).toBe(false);
  });

  it('should return true for event with extra properties', () => {
    const event = { id: '123', status: 'completed', extra: 'data' };
    expect(isWebhookEvent(event)).toBe(true);
  });
});

describe('parseWebhookEvent', () => {
  it('should parse valid completed event', () => {
    const event = parseWebhookEvent({ id: 'test-id', status: 'completed' });
    expect(event).toEqual({ id: 'test-id', status: 'completed' });
  });

  it('should parse valid error event', () => {
    const event = parseWebhookEvent({ id: 'test-id', status: 'error' });
    expect(event).toEqual({ id: 'test-id', status: 'error' });
  });

  it('should parse JSON string', () => {
    const json = JSON.stringify({ id: 'test-id', status: 'completed' });
    const event = parseWebhookEvent(json);
    expect(event).toEqual({ id: 'test-id', status: 'completed' });
  });

  it('should throw for invalid JSON string', () => {
    expect(() => parseWebhookEvent('not valid json')).toThrow('Invalid webhook payload: not valid JSON');
  });

  it('should throw for non-object', () => {
    expect(() => parseWebhookEvent(null)).toThrow('Invalid webhook payload: expected an object');
    expect(() => parseWebhookEvent(123)).toThrow('Invalid webhook payload: expected an object');
  });

  it('should throw for missing id', () => {
    expect(() => parseWebhookEvent({ status: 'completed' })).toThrow(
      'Invalid webhook payload: missing or invalid "id" field'
    );
  });

  it('should throw for non-string id', () => {
    expect(() => parseWebhookEvent({ id: 123, status: 'completed' })).toThrow(
      'Invalid webhook payload: missing or invalid "id" field'
    );
  });

  it('should throw for empty id', () => {
    expect(() => parseWebhookEvent({ id: '', status: 'completed' })).toThrow(
      'Invalid webhook payload: "id" field cannot be empty'
    );
  });

  it('should throw for invalid status with descriptive message', () => {
    expect(() => parseWebhookEvent({ id: '123', status: 'pending' })).toThrow(
      'Invalid webhook payload: "status" must be "completed" or "error", got "pending"'
    );
  });

  it('should throw for missing status', () => {
    expect(() => parseWebhookEvent({ id: '123' })).toThrow(
      'Invalid webhook payload: "status" must be "completed" or "error"'
    );
  });

  it('should strip extra properties from result', () => {
    const event = parseWebhookEvent({ id: 'test-id', status: 'completed', extra: 'data' });
    expect(event).toEqual({ id: 'test-id', status: 'completed' });
    expect((event as Record<string, unknown>).extra).toBeUndefined();
  });
});

describe('verifyWebhookAuth', () => {
  const auth: WebhookAuthConfig = {
    name: 'X-Webhook-Secret',
    value: 'secret-token',
  };

  it('should return true for matching header (exact case)', () => {
    const headers = { 'X-Webhook-Secret': 'secret-token' };
    expect(verifyWebhookAuth(headers, auth)).toBe(true);
  });

  it('should return true for matching header (case-insensitive name)', () => {
    const headers = { 'x-webhook-secret': 'secret-token' };
    expect(verifyWebhookAuth(headers, auth)).toBe(true);
  });

  it('should return true for matching header (uppercase)', () => {
    const headers = { 'X-WEBHOOK-SECRET': 'secret-token' };
    expect(verifyWebhookAuth(headers, auth)).toBe(true);
  });

  it('should return false for wrong value', () => {
    const headers = { 'X-Webhook-Secret': 'wrong-token' };
    expect(verifyWebhookAuth(headers, auth)).toBe(false);
  });

  it('should return false for missing header', () => {
    const headers = { 'Other-Header': 'value' };
    expect(verifyWebhookAuth(headers, auth)).toBe(false);
  });

  it('should return false for empty headers', () => {
    expect(verifyWebhookAuth({}, auth)).toBe(false);
  });

  it('should work with Headers object', () => {
    const headers = new Headers({ 'X-Webhook-Secret': 'secret-token' });
    expect(verifyWebhookAuth(headers, auth)).toBe(true);
  });

  it('should work with Headers object (case-insensitive)', () => {
    const headers = new Headers({ 'x-webhook-secret': 'secret-token' });
    expect(verifyWebhookAuth(headers, auth)).toBe(true);
  });

  it('should work with array header values (takes first)', () => {
    const headers = { 'X-Webhook-Secret': ['secret-token', 'other'] as string[] };
    expect(verifyWebhookAuth(headers, auth)).toBe(true);
  });

  it('should return false for array with wrong first value', () => {
    const headers = { 'X-Webhook-Secret': ['wrong', 'secret-token'] as string[] };
    expect(verifyWebhookAuth(headers, auth)).toBe(false);
  });

  it('should handle undefined header value', () => {
    const headers = { 'X-Webhook-Secret': undefined };
    expect(verifyWebhookAuth(headers, auth)).toBe(false);
  });
});

describe('handleWebhook', () => {
  const validPayload: WebhookEvent = { id: 'test-id', status: 'completed' };

  describe('method validation', () => {
    it('should return 405 for GET method', () => {
      const result = handleWebhook({
        method: 'GET',
        headers: {},
        body: validPayload,
      });
      expect(result).toEqual({
        ok: false,
        status: 405,
        error: 'Method not allowed',
      });
    });

    it('should return 405 for PUT method', () => {
      const result = handleWebhook({
        method: 'PUT',
        headers: {},
        body: validPayload,
      });
      expect(result).toEqual({
        ok: false,
        status: 405,
        error: 'Method not allowed',
      });
    });

    it('should accept POST method', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: validPayload,
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it('should accept post method (case-insensitive)', () => {
      const result = handleWebhook({
        method: 'post',
        headers: {},
        body: validPayload,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('authentication', () => {
    const auth: WebhookAuthConfig = {
      name: 'X-Webhook-Secret',
      value: 'secret-token',
    };

    it('should return 401 when auth required but header missing', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: validPayload,
        auth,
      });
      expect(result).toEqual({
        ok: false,
        status: 401,
        error: 'Unauthorized',
      });
    });

    it('should return 401 when auth required but header wrong', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: { 'X-Webhook-Secret': 'wrong-token' },
        body: validPayload,
        auth,
      });
      expect(result).toEqual({
        ok: false,
        status: 401,
        error: 'Unauthorized',
      });
    });

    it('should succeed when auth header matches', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: { 'X-Webhook-Secret': 'secret-token' },
        body: validPayload,
        auth,
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it('should succeed when auth header matches (case-insensitive)', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: { 'x-webhook-secret': 'secret-token' },
        body: validPayload,
        auth,
      });
      expect(result.ok).toBe(true);
    });

    it('should succeed when no auth required', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: validPayload,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('payload validation', () => {
    it('should return 400 for invalid payload', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: { invalid: 'data' },
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain('Invalid webhook payload');
    });

    it('should return 400 for null body', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: null,
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it('should return event for valid payload', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: validPayload,
      });
      expect(result).toEqual({
        ok: true,
        status: 200,
        event: validPayload,
      });
    });

    it('should parse JSON string body', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: JSON.stringify(validPayload),
      });
      expect(result.ok).toBe(true);
      expect(result.event).toEqual(validPayload);
    });
  });

  describe('complete flow', () => {
    it('should handle valid authenticated request', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: { 'X-Webhook-Secret': 'my-secret' },
        body: { id: 'trans-123', status: 'completed' },
        auth: { name: 'X-Webhook-Secret', value: 'my-secret' },
      });
      expect(result).toEqual({
        ok: true,
        status: 200,
        event: { id: 'trans-123', status: 'completed' },
      });
    });

    it('should handle error status event', () => {
      const result = handleWebhook({
        method: 'POST',
        headers: {},
        body: { id: 'trans-123', status: 'error' },
      });
      expect(result).toEqual({
        ok: true,
        status: 200,
        event: { id: 'trans-123', status: 'error' },
      });
    });
  });
});

describe('handleWebhookRequest', () => {
  const createMockRequest = (options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Request => {
    const { method = 'POST', headers = {}, body } = options;
    const normalizedMethod = method.toUpperCase();
    const requestInit: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (body !== undefined && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
      requestInit.body = JSON.stringify(body);
    }
    return new Request('http://localhost/webhook', requestInit);
  };

  it('should handle valid POST request', async () => {
    const request = createMockRequest({
      body: { id: 'test-id', status: 'completed' },
    });

    const result = await handleWebhookRequest(request);

    expect(result).toEqual({
      ok: true,
      status: 200,
      event: { id: 'test-id', status: 'completed' },
    });
  });

  it('should reject non-POST request', async () => {
    const request = createMockRequest({
      method: 'GET',
      body: { id: 'test-id', status: 'completed' },
    });

    const result = await handleWebhookRequest(request);

    expect(result).toEqual({
      ok: false,
      status: 405,
      error: 'Method not allowed',
    });
  });

  it('should verify authentication', async () => {
    const request = createMockRequest({
      headers: { 'X-Webhook-Secret': 'correct-token' },
      body: { id: 'test-id', status: 'completed' },
    });

    const result = await handleWebhookRequest(request, {
      name: 'X-Webhook-Secret',
      value: 'correct-token',
    });

    expect(result.ok).toBe(true);
  });

  it('should reject invalid authentication', async () => {
    const request = createMockRequest({
      headers: { 'X-Webhook-Secret': 'wrong-token' },
      body: { id: 'test-id', status: 'completed' },
    });

    const result = await handleWebhookRequest(request, {
      name: 'X-Webhook-Secret',
      value: 'correct-token',
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('should return 400 for invalid JSON', async () => {
    const request = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const result = await handleWebhookRequest(request);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid webhook payload: not valid JSON',
    });
  });

  it('should return 400 for invalid payload structure', async () => {
    const request = createMockRequest({
      body: { wrong: 'structure' },
    });

    const result = await handleWebhookRequest(request);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

describe('getWebhookAuthFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
    delete process.env[SONIOX_API_WEBHOOK_HEADER_ENV];
    delete process.env[SONIOX_API_WEBHOOK_SECRET_ENV];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return auth config when both env vars are set', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Webhook-Secret';
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = 'my-secret-token';

    const auth = getWebhookAuthFromEnv();

    expect(auth).toEqual({
      name: 'X-Webhook-Secret',
      value: 'my-secret-token',
    });
  });

  it('should return undefined when only header is set', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Webhook-Secret';

    const auth = getWebhookAuthFromEnv();

    expect(auth).toBeUndefined();
  });

  it('should return undefined when only secret is set', () => {
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = 'my-secret-token';

    const auth = getWebhookAuthFromEnv();

    expect(auth).toBeUndefined();
  });

  it('should return undefined when neither env var is set', () => {
    const auth = getWebhookAuthFromEnv();

    expect(auth).toBeUndefined();
  });

  it('should return undefined when header is empty string', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = '';
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = 'my-secret-token';

    const auth = getWebhookAuthFromEnv();

    expect(auth).toBeUndefined();
  });

  it('should return undefined when secret is empty string', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Webhook-Secret';
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = '';

    const auth = getWebhookAuthFromEnv();

    expect(auth).toBeUndefined();
  });
});

describe('handleWebhook with environment variables', () => {
  const originalEnv = process.env;
  const validPayload: WebhookEvent = { id: 'test-id', status: 'completed' };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[SONIOX_API_WEBHOOK_HEADER_ENV];
    delete process.env[SONIOX_API_WEBHOOK_SECRET_ENV];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use env vars for auth when no explicit auth provided', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Webhook-Secret';
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = 'env-secret';

    // Request without the expected header should fail
    const result = handleWebhook({
      method: 'POST',
      headers: {},
      body: validPayload,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('should succeed when request has matching env var auth header', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Webhook-Secret';
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = 'env-secret';

    const result = handleWebhook({
      method: 'POST',
      headers: { 'X-Webhook-Secret': 'env-secret' },
      body: validPayload,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('should prefer explicit auth over env vars', () => {
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Env-Header';
    process.env[SONIOX_API_WEBHOOK_SECRET_ENV] = 'env-secret';

    // Use explicit auth that differs from env vars
    const result = handleWebhook({
      method: 'POST',
      headers: { 'X-Explicit-Header': 'explicit-secret' },
      body: validPayload,
      auth: { name: 'X-Explicit-Header', value: 'explicit-secret' },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('should skip auth when env vars not fully configured', () => {
    // Only header set, no secret
    process.env[SONIOX_API_WEBHOOK_HEADER_ENV] = 'X-Webhook-Secret';

    const result = handleWebhook({
      method: 'POST',
      headers: {},
      body: validPayload,
    });

    // Should succeed without auth since env vars are incomplete
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('should skip auth when no env vars and no explicit auth', () => {
    const result = handleWebhook({
      method: 'POST',
      headers: {},
      body: validPayload,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });
});

describe('SonioxWebhooksAPI with fetch helpers', () => {
  const validPayload: WebhookEvent = { id: 'test-transcription-id', status: 'completed' };
  const errorPayload: WebhookEvent = { id: 'error-transcription-id', status: 'error' };

  const mockTranscript = { id: 'test-transcription-id', text: 'Hello world', tokens: [] };
  const mockTranscription = {
    id: 'test-transcription-id',
    status: 'completed',
    error_type: null,
    error_message: null,
  };
  const mockErrorTranscription = {
    id: 'error-transcription-id',
    status: 'error',
    error_type: 'processing_error',
    error_message: 'Audio file is corrupted',
  };

  type MockTranscriptionsAPI = {
    getTranscript: jest.Mock;
    get: jest.Mock;
  };

  // Create a mock that satisfies the minimum interface needed by SonioxWebhooksAPI
  const createMockTranscriptionsAPI = () => ({
    getTranscript: jest.fn().mockResolvedValue(mockTranscript),
    get: jest.fn().mockImplementation((id: string) => {
      if (id === 'error-transcription-id') {
        return Promise.resolve(mockErrorTranscription);
      }
      return Promise.resolve(mockTranscription);
    }),
  });

  // Type-safe way to create API with mock
  const createApiWithMock = (mock: MockTranscriptionsAPI) => {
    // Cast through unknown since we're providing a partial mock
    return new SonioxWebhooksAPI(mock as unknown as undefined);
  };

  describe('without transcriptions API', () => {
    it('should return undefined fetch helpers when no transcriptions API', () => {
      const api = new SonioxWebhooksAPI();
      const result = api.handleExpress({
        method: 'POST',
        headers: {},
        body: validPayload,
      });

      expect(result.ok).toBe(true);
      expect(result.fetchTranscript).toBeUndefined();
      expect(result.fetchTranscription).toBeUndefined();
    });
  });

  describe('with transcriptions API', () => {
    it('should include fetchTranscript for completed status', () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const result = api.handleExpress({
        method: 'POST',
        headers: {},
        body: validPayload,
      });

      expect(result.ok).toBe(true);
      expect(result.fetchTranscript).toBeDefined();
      expect(result.fetchTranscription).toBeDefined();
    });

    it('should not include fetchTranscript for error status', () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const result = api.handleExpress({
        method: 'POST',
        headers: {},
        body: errorPayload,
      });

      expect(result.ok).toBe(true);
      expect(result.fetchTranscript).toBeUndefined();
      expect(result.fetchTranscription).toBeDefined();
    });

    it('fetchTranscript should call transcriptions.getTranscript', async () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const result = api.handleExpress({
        method: 'POST',
        headers: {},
        body: validPayload,
      });

      const transcript = await result.fetchTranscript?.();

      expect(mockApi.getTranscript).toHaveBeenCalledWith('test-transcription-id');
      expect(transcript).toEqual(mockTranscript);
    });

    it('fetchTranscription should call transcriptions.get', async () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const result = api.handleExpress({
        method: 'POST',
        headers: {},
        body: validPayload,
      });

      const transcription = await result.fetchTranscription?.();

      expect(mockApi.get).toHaveBeenCalledWith('test-transcription-id');
      expect(transcription).toEqual(mockTranscription);
    });

    it('fetchTranscription should return error details for error status', async () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const result = api.handleExpress({
        method: 'POST',
        headers: {},
        body: errorPayload,
      });

      const transcription = await result.fetchTranscription?.();

      expect(mockApi.get).toHaveBeenCalledWith('error-transcription-id');
      expect(transcription).toEqual(mockErrorTranscription);
    });

    it('should not include fetch helpers when webhook validation fails', () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const result = api.handleExpress({
        method: 'GET', // Invalid method
        headers: {},
        body: validPayload,
      });

      expect(result.ok).toBe(false);
      expect(result.fetchTranscript).toBeUndefined();
      expect(result.fetchTranscription).toBeUndefined();
    });
  });

  describe('async handlers with fetch helpers', () => {
    it('handleRequest should include fetch helpers', async () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

      const result = await api.handleRequest(request);

      expect(result.ok).toBe(true);
      expect(result.fetchTranscript).toBeDefined();
      expect(result.fetchTranscription).toBeDefined();
    });

    it('handleHono should include fetch helpers', async () => {
      const mockApi = createMockTranscriptionsAPI();
      const api = createApiWithMock(mockApi);
      const ctx = {
        req: {
          method: 'POST',
          header: () => undefined,
          json: () => Promise.resolve(validPayload),
        },
      };

      const result = await api.handleHono(ctx);

      expect(result.ok).toBe(true);
      expect(result.fetchTranscript).toBeDefined();
      expect(result.fetchTranscription).toBeDefined();
    });
  });
});
