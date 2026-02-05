import {
  RealtimeError,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  AbortError,
  StateError,
  mapErrorResponse,
} from '../../../src/realtime/errors';
import { SonioxError } from '../../../src/http/errors';

describe('RealtimeError', () => {
  it('should create error with message only', () => {
    const error = new RealtimeError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('RealtimeError');
    expect(error.code).toBe('realtime_error');
    expect(error.statusCode).toBeUndefined();
    expect(error.raw).toBeUndefined();
  });

  it('should create error with message and code', () => {
    const error = new RealtimeError('Test error', 'bad_request');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('bad_request');
    expect(error.statusCode).toBeUndefined();
  });

  it('should create error with message, code, and statusCode', () => {
    const error = new RealtimeError('Test error', 'bad_request', 400);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('bad_request');
    expect(error.statusCode).toBe(400);
  });

  it('should create error with message, code, statusCode, and raw', () => {
    const raw = { error_code: 400, error_message: 'Bad Request' };
    const error = new RealtimeError('Test error', 'bad_request', 400, raw);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('bad_request');
    expect(error.statusCode).toBe(400);
    expect(error.raw).toEqual(raw);
  });

  it('should be instanceof Error and SonioxError', () => {
    const error = new RealtimeError('Test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SonioxError);
    expect(error).toBeInstanceOf(RealtimeError);
  });

  it('should serialize to string correctly', () => {
    const error = new RealtimeError('Test error', 'bad_request', 400);

    expect(error.toString()).toBe('RealtimeError [bad_request]: Test error\n  Status: 400');
  });

  it('should serialize to JSON correctly', () => {
    const raw = { error_code: 400, error_message: 'Bad Request' };
    const error = new RealtimeError('Test error', 'bad_request', 400, raw);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'RealtimeError',
      message: 'Test error',
      code: 'bad_request',
      statusCode: 400,
      raw: raw,
    });
  });
});

describe('AuthError', () => {
  it('should have correct name and code', () => {
    const error = new AuthError('Invalid API key', 401);

    expect(error.name).toBe('AuthError');
    expect(error.code).toBe('auth_error');
    expect(error.statusCode).toBe(401);
  });

  it('should be instanceof RealtimeError and SonioxError', () => {
    const error = new AuthError('Invalid API key');

    expect(error).toBeInstanceOf(SonioxError);
    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(AuthError);
  });
});

describe('BadRequestError', () => {
  it('should have correct name and code', () => {
    const error = new BadRequestError('Invalid config', 400);

    expect(error.name).toBe('BadRequestError');
    expect(error.code).toBe('bad_request');
    expect(error.statusCode).toBe(400);
  });

  it('should be instanceof RealtimeError', () => {
    const error = new BadRequestError('Invalid config');

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(BadRequestError);
  });
});

describe('QuotaError', () => {
  it('should have correct name and code', () => {
    const error = new QuotaError('Rate limit exceeded', 429);

    expect(error.name).toBe('QuotaError');
    expect(error.code).toBe('quota_exceeded');
    expect(error.statusCode).toBe(429);
  });

  it('should be instanceof RealtimeError', () => {
    const error = new QuotaError('Quota exceeded');

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(QuotaError);
  });
});

describe('ConnectionError', () => {
  it('should have correct name and code', () => {
    const error = new ConnectionError('WebSocket failed');

    expect(error.name).toBe('ConnectionError');
    expect(error.code).toBe('connection_error');
    expect(error.statusCode).toBeUndefined();
  });

  it('should accept raw event', () => {
    const event = { type: 'error' };
    const error = new ConnectionError('WebSocket failed', event);

    expect(error.raw).toEqual(event);
  });

  it('should be instanceof RealtimeError', () => {
    const error = new ConnectionError('WebSocket failed');

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(ConnectionError);
  });
});

describe('NetworkError', () => {
  it('should have correct name and code', () => {
    const error = new NetworkError('Service unavailable', 503);

    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe('network_error');
    expect(error.statusCode).toBe(503);
  });

  it('should accept raw response', () => {
    const response = { error_code: 500, error_message: 'Internal error' };
    const error = new NetworkError('Internal error', 500, response);

    expect(error.raw).toEqual(response);
  });

  it('should be instanceof RealtimeError', () => {
    const error = new NetworkError('Timeout', 408);

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(NetworkError);
  });
});

describe('AbortError', () => {
  it('should have default message and correct code', () => {
    const error = new AbortError();

    expect(error.message).toBe('Operation aborted');
    expect(error.name).toBe('AbortError');
    expect(error.code).toBe('aborted');
  });

  it('should accept custom message', () => {
    const error = new AbortError('Custom abort message');

    expect(error.message).toBe('Custom abort message');
  });

  it('should be instanceof RealtimeError', () => {
    const error = new AbortError();

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(AbortError);
  });
});

describe('StateError', () => {
  it('should have correct name and code', () => {
    const error = new StateError('Cannot connect: already connected');

    expect(error.message).toBe('Cannot connect: already connected');
    expect(error.name).toBe('StateError');
    expect(error.code).toBe('state_error');
  });

  it('should be instanceof RealtimeError', () => {
    const error = new StateError('Invalid state');

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).toBeInstanceOf(StateError);
  });
});

describe('mapErrorResponse', () => {
  it('should map 401 to AuthError', () => {
    const response = { error_code: 401, error_message: 'Invalid API key' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe('Invalid API key');
    expect(error.code).toBe('auth_error');
    expect(error.statusCode).toBe(401);
    expect(error.raw).toEqual(response);
  });

  it('should map 400 to BadRequestError', () => {
    const response = { error_code: 400, error_message: 'Invalid audio format' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Invalid audio format');
    expect(error.code).toBe('bad_request');
    expect(error.statusCode).toBe(400);
  });

  it('should map 402 to QuotaError', () => {
    const response = { error_code: 402, error_message: 'Payment required' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(QuotaError);
    expect(error.code).toBe('quota_exceeded');
    expect(error.statusCode).toBe(402);
  });

  it('should map 429 to QuotaError', () => {
    const response = { error_code: 429, error_message: 'Too many requests' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(QuotaError);
    expect(error.code).toBe('quota_exceeded');
    expect(error.statusCode).toBe(429);
  });

  it('should map 408 to NetworkError', () => {
    const response = { error_code: 408, error_message: 'Request timeout' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('network_error');
    expect(error.statusCode).toBe(408);
  });

  it('should map 500 to NetworkError', () => {
    const response = { error_code: 500, error_message: 'Internal server error' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('network_error');
    expect(error.statusCode).toBe(500);
  });

  it('should map 503 to NetworkError', () => {
    const response = { error_code: 503, error_message: 'Service unavailable' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('network_error');
    expect(error.statusCode).toBe(503);
  });

  it('should return generic RealtimeError for unknown codes', () => {
    const response = { error_code: 418, error_message: 'Teapot' };

    const error = mapErrorResponse(response);

    expect(error).toBeInstanceOf(RealtimeError);
    expect(error).not.toBeInstanceOf(AuthError);
    expect(error).not.toBeInstanceOf(BadRequestError);
    expect(error).not.toBeInstanceOf(QuotaError);
    expect(error.code).toBe('realtime_error');
    expect(error.statusCode).toBe(418);
  });

  it('should handle missing error_message', () => {
    const response = { error_code: 401 };

    const error = mapErrorResponse(response);

    expect(error.message).toBe('Unknown error');
  });

  it('should handle missing error_code', () => {
    const response = { error_message: 'Something went wrong' };

    const error = mapErrorResponse(response);

    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBeUndefined();
    expect(error.code).toBe('realtime_error');
  });
});
