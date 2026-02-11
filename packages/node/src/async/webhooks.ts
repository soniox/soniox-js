import { SONIOX_API_WEBHOOK_HEADER_ENV, SONIOX_API_WEBHOOK_SECRET_ENV } from '../constants.js';
import type {
  ExpressLikeRequest,
  FastifyLikeRequest,
  HandleWebhookOptions,
  HonoLikeContext,
  NestJSLikeRequest,
  WebhookAuthConfig,
  WebhookEvent,
  WebhookEventStatus,
  WebhookHandlerResult,
  WebhookHandlerResultWithFetch,
  WebhookHeaders,
} from '../types/public/webhooks.js';

import type { SonioxSttApi } from './stt.js';

export type {
  ExpressLikeRequest,
  FastifyLikeRequest,
  HandleWebhookOptions,
  HonoLikeContext,
  NestJSLikeRequest,
  WebhookAuthConfig,
  WebhookEvent,
  WebhookEventStatus,
  WebhookHandlerResult,
  WebhookHandlerResultWithFetch,
  WebhookHeaders,
};

const VALID_STATUSES: WebhookEventStatus[] = ['completed', 'error'];

/**
 * Get webhook authentication configuration from environment variables.
 *
 * Reads `SONIOX_API_WEBHOOK_HEADER` and `SONIOX_API_WEBHOOK_SECRET` environment variables.
 * Returns undefined if either variable is not set (both are required for authentication).
 *
 * @returns WebhookAuthConfig if both env vars are set, undefined otherwise
 *
 * @example
 * ```typescript
 * // Set environment variables:
 * // SONIOX_API_WEBHOOK_HEADER=X-Webhook-Secret
 * // SONIOX_API_WEBHOOK_SECRET=my-secret-token
 *
 * const auth = getWebhookAuthFromEnv();
 * // Returns: { name: 'X-Webhook-Secret', value: 'my-secret-token' }
 * ```
 */
export function getWebhookAuthFromEnv(): WebhookAuthConfig | undefined {
  const headerName = process.env[SONIOX_API_WEBHOOK_HEADER_ENV];
  const headerValue = process.env[SONIOX_API_WEBHOOK_SECRET_ENV];

  // Both header name and secret value must be set for auth to work
  if (headerName && headerValue) {
    return {
      name: headerName,
      value: headerValue,
    };
  }

  return undefined;
}

/**
 * Resolve webhook authentication configuration.
 *
 * If explicit auth is provided, it is used. Otherwise, attempts to read from
 * environment variables (`SONIOX_API_WEBHOOK_HEADER` and `SONIOX_API_WEBHOOK_SECRET`).
 *
 * @param auth - Explicit authentication configuration (takes precedence)
 * @returns Resolved WebhookAuthConfig or undefined if not configured
 */
function resolveWebhookAuth(auth?: WebhookAuthConfig): WebhookAuthConfig | undefined {
  return auth ?? getWebhookAuthFromEnv();
}

/**
 * Type guard to check if a value is a valid WebhookEvent
 *
 * @param payload - Value to check
 * @returns True if payload is a valid WebhookEvent
 *
 * @example
 * ```typescript
 * if (isWebhookEvent(body)) {
 *     console.log(body.id, body.status);
 * }
 * ```
 */
export function isWebhookEvent(payload: unknown): payload is WebhookEvent {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return false;
  }

  if (!VALID_STATUSES.includes(obj.status as WebhookEventStatus)) {
    return false;
  }

  return true;
}

/**
 * Parse and validate a webhook event payload
 *
 * @param payload - Raw payload to parse (object or JSON string)
 * @returns Validated WebhookEvent
 * @throws `Error` if payload is invalid
 *
 * @example
 * ```typescript
 * try {
 *     const event = parseWebhookEvent(req.body);
 *     console.log(event.id, event.status);
 * } catch (error) {
 *     console.error('Invalid webhook payload:', error.message);
 * }
 * ```
 */
export function parseWebhookEvent(payload: unknown): WebhookEvent {
  // Handle string input (parse as JSON)
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('Invalid webhook payload: not valid JSON');
    }
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid webhook payload: expected an object');
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.id !== 'string') {
    throw new Error('Invalid webhook payload: missing or invalid "id" field');
  }

  if (obj.id.length === 0) {
    throw new Error('Invalid webhook payload: "id" field cannot be empty');
  }

  if (!VALID_STATUSES.includes(obj.status as WebhookEventStatus)) {
    throw new Error(`Invalid webhook payload: "status" must be "completed" or "error", got "${String(obj.status)}"`);
  }

  return {
    id: obj.id,
    status: obj.status as WebhookEventStatus,
  };
}

/**
 * Get a header value from various header formats (case-insensitive)
 */
function getHeaderValue(headers: WebhookHeaders, name: string): string | null {
  const lowerName = name.toLowerCase();

  // Fetch API Headers
  if (headers instanceof Headers) {
    return headers.get(lowerName);
  }

  // Object with get method (like Express headers or custom)
  if (typeof (headers as { get?(name: string): string | null }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(lowerName);
  }

  // Plain object
  const record = headers as Record<string, string | string[] | undefined>;

  // Try exact match first
  if (lowerName in record) {
    const value = record[lowerName];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }

  // Case-insensitive search
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lowerName) {
      const value = record[key];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    }
  }

  return null;
}

/**
 * Verify webhook authentication header
 *
 * @param headers - Request headers
 * @param auth - Authentication configuration with expected header name and value
 * @returns True if authentication passes, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = verifyWebhookAuth(req.headers, {
 *     name: 'X-Webhook-Secret',
 *     value: process.env.WEBHOOK_SECRET,
 * });
 *
 * if (!isValid) {
 *     return res.status(401).send('Unauthorized');
 * }
 * ```
 */
export function verifyWebhookAuth(headers: WebhookHeaders, auth: WebhookAuthConfig): boolean {
  const headerValue = getHeaderValue(headers, auth.name);
  return headerValue === auth.value;
}

/**
 * Framework-agnostic webhook handler
 *
 * Validates the HTTP method, authentication (if configured), and parses the webhook payload.
 * Returns a result object that can be used to construct an HTTP response.
 *
 * Authentication is resolved in this order:
 * 1. Explicit `auth` option if provided
 * 2. Environment variables `SONIOX_API_WEBHOOK_HEADER` and `SONIOX_API_WEBHOOK_SECRET`
 * 3. No authentication if neither is configured
 *
 * @param options - Handler options including method, headers, body, and optional auth
 * @returns Result with ok status, HTTP status code, and either event or error
 *
 * @example
 * ```typescript
 * // Option 1: Set environment variables (recommended)
 * // SONIOX_API_WEBHOOK_HEADER=X-Webhook-Secret
 * // SONIOX_API_WEBHOOK_SECRET=my-secret
 * const result = handleWebhook({
 *     method: req.method,
 *     headers: req.headers,
 *     body: req.body,
 * });
 *
 * // Option 2: Explicit auth config (overrides env vars)
 * const result = handleWebhook({
 *     method: req.method,
 *     headers: req.headers,
 *     body: req.body,
 *     auth: {
 *         name: 'X-Webhook-Secret',
 *         value: process.env.WEBHOOK_SECRET,
 *     },
 * });
 *
 * if (result.ok) {
 *     console.log('Transcription completed:', result.event.id);
 * }
 *
 * res.status(result.status).json(result.ok ? { received: true } : { error: result.error });
 * ```
 */
export function handleWebhook(options: HandleWebhookOptions): WebhookHandlerResult {
  const { method, headers, body, auth } = options;

  // Validate HTTP method
  if (method.toUpperCase() !== 'POST') {
    return {
      ok: false,
      status: 405,
      error: 'Method not allowed',
    };
  }

  // Resolve authentication from explicit config or environment variables
  const resolvedAuth = resolveWebhookAuth(auth);

  // Verify authentication if configured
  if (resolvedAuth) {
    if (!verifyWebhookAuth(headers, resolvedAuth)) {
      return {
        ok: false,
        status: 401,
        error: 'Unauthorized',
      };
    }
  }

  // Parse and validate payload
  try {
    const event = parseWebhookEvent(body);
    return {
      ok: true,
      status: 200,
      event,
    };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid webhook payload',
    };
  }
}

/**
 * Handle a webhook from a Fetch API Request (Bun/Deno/Node 18+)
 *
 * @param request - Fetch API Request object
 * @param auth - Optional authentication configuration
 * @returns Result with ok status, HTTP status code, and either event or error
 *
 * @example
 * ```typescript
 * // Bun.serve handler
 * Bun.serve({
 *     async fetch(req) {
 *         if (new URL(req.url).pathname === '/webhook') {
 *             const result = await handleWebhookRequest(req);
 *
 *             if (result.ok) {
 *                 console.log('Received webhook:', result.event.id);
 *             }
 *
 *             return new Response(
 *                 JSON.stringify(result.ok ? { received: true } : { error: result.error }),
 *                 { status: result.status, headers: { 'Content-Type': 'application/json' } }
 *             );
 *         }
 *     },
 * });
 * ```
 */
export async function handleWebhookRequest(request: Request, auth?: WebhookAuthConfig): Promise<WebhookHandlerResult> {
  if (request.method.toUpperCase() !== 'POST') {
    return {
      ok: false,
      status: 405,
      error: 'Method not allowed',
    };
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid webhook payload: not valid JSON',
    };
  }

  const options: HandleWebhookOptions = {
    method: request.method,
    headers: request.headers,
    body,
  };
  if (auth) {
    options.auth = auth;
  }
  return handleWebhook(options);
}

/**
 * Handle a webhook from an Express-like request
 *
 * @param req - Express request object
 * @param auth - Optional authentication configuration
 * @returns Result with ok status, HTTP status code, and either event or error
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { handleWebhookExpress } from '@soniox/node';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.post('/webhook', (req, res) => {
 *     const result = handleWebhookExpress(req);
 *
 *     if (result.ok) {
 *         console.log('Received webhook:', result.event.id);
 *     }
 *
 *     res.status(result.status).json(
 *         result.ok ? { received: true } : { error: result.error }
 *     );
 * });
 * ```
 */
export function handleWebhookExpress(req: ExpressLikeRequest, auth?: WebhookAuthConfig): WebhookHandlerResult {
  const options: HandleWebhookOptions = {
    method: req.method,
    headers: req.headers,
    body: req.body,
  };
  if (auth) {
    options.auth = auth;
  }
  return handleWebhook(options);
}

/**
 * Handle a webhook from a Fastify request
 *
 * @param req - Fastify request object
 * @param auth - Optional authentication configuration
 * @returns Result with ok status, HTTP status code, and either event or error
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { handleWebhookFastify } from '@soniox/node';
 *
 * const fastify = Fastify();
 *
 * fastify.post('/webhook', async (req, reply) => {
 *     const result = handleWebhookFastify(req);
 *
 *     if (result.ok) {
 *         console.log('Received webhook:', result.event.id);
 *     }
 *
 *     return reply.status(result.status).send(
 *         result.ok ? { received: true } : { error: result.error }
 *     );
 * });
 * ```
 */
export function handleWebhookFastify(req: FastifyLikeRequest, auth?: WebhookAuthConfig): WebhookHandlerResult {
  const options: HandleWebhookOptions = {
    method: req.method,
    headers: req.headers,
    body: req.body,
  };
  if (auth) {
    options.auth = auth;
  }
  return handleWebhook(options);
}

/**
 * Handle a webhook from a NestJS request
 *
 * Works with NestJS using either Express or Fastify adapter.
 *
 * @param req - NestJS request object (injected via @Req() decorator)
 * @param auth - Optional authentication configuration (overrides env vars)
 * @returns Result with ok status, HTTP status code, and either event or error
 *
 * @example
 * ```typescript
 * import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
 * import { Request, Response } from 'express';
 * import { handleWebhookNestJS } from '@soniox/node';
 *
 * @Controller('webhook')
 * export class WebhookController {
 *     @Post()
 *     handleWebhook(@Req() req: Request, @Res() res: Response) {
 *         const result = handleWebhookNestJS(req);
 *
 *         if (result.ok) {
 *             console.log('Received webhook:', result.event.id);
 *         }
 *
 *         return res.status(result.status).json(
 *             result.ok ? { received: true } : { error: result.error }
 *         );
 *     }
 * }
 * ```
 */
export function handleWebhookNestJS(req: NestJSLikeRequest, auth?: WebhookAuthConfig): WebhookHandlerResult {
  const options: HandleWebhookOptions = {
    method: req.method,
    headers: req.headers,
    body: req.body,
  };
  if (auth) {
    options.auth = auth;
  }
  return handleWebhook(options);
}

/**
 * Handle a webhook from a Hono context
 *
 * @param c - Hono context object
 * @param auth - Optional authentication configuration
 * @returns Result with ok status, HTTP status code, and either event or error
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { handleWebhookHono } from '@soniox/node';
 *
 * const app = new Hono();
 *
 * app.post('/webhook', async (c) => {
 *     const result = await handleWebhookHono(c);
 *
 *     if (result.ok) {
 *         console.log('Received webhook:', result.event.id);
 *     }
 *
 *     return c.json(
 *         result.ok ? { received: true } : { error: result.error },
 *         result.status
 *     );
 * });
 * ```
 */
export async function handleWebhookHono(c: HonoLikeContext, auth?: WebhookAuthConfig): Promise<WebhookHandlerResult> {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid webhook payload: not valid JSON',
    };
  }

  // Build headers object from Hono's header getter
  const headers: WebhookHeaders = {
    get(name: string): string | null {
      return c.req.header(name) ?? null;
    },
  };

  const options: HandleWebhookOptions = {
    method: c.req.method,
    headers,
    body,
  };
  if (auth) {
    options.auth = auth;
  }
  return handleWebhook(options);
}

/**
 * Webhook utilities API accessible via client.webhooks
 *
 * Provides methods for handling incoming Soniox webhook requests.
 * When used via the client, results include lazy fetch helpers for transcripts.
 */
export class SonioxWebhooksAPI {
  private stt: SonioxSttApi | undefined;

  /**
   * @internal
   */
  constructor(stt?: SonioxSttApi) {
    this.stt = stt;
  }

  /**
   * Enhance a webhook result with fetch helpers
   */
  private withFetchHelpers(result: WebhookHandlerResult): WebhookHandlerResultWithFetch {
    const stt = this.stt;
    const event = result.event;

    // If no stt API or no event, return result without fetch helpers
    if (!stt || !event) {
      return {
        ...result,
        fetchTranscript: undefined,
        fetchTranscription: undefined,
      };
    }

    const transcriptionId = event.id;

    return {
      ...result,
      fetchTranscript: event.status === 'completed' ? () => stt.getTranscript(transcriptionId) : undefined,
      fetchTranscription: () => stt.get(transcriptionId),
    };
  }

  /**
   * Get webhook authentication configuration from environment variables.
   *
   * Reads `SONIOX_API_WEBHOOK_HEADER` and `SONIOX_API_WEBHOOK_SECRET` environment variables.
   * Returns undefined if either variable is not set (both are required for authentication).
   */
  getAuthFromEnv(): WebhookAuthConfig | undefined {
    return getWebhookAuthFromEnv();
  }

  /**
   * Type guard to check if a value is a valid WebhookEvent
   */
  isEvent(payload: unknown): payload is WebhookEvent {
    return isWebhookEvent(payload);
  }

  /**
   * Parse and validate a webhook event payload
   */
  parseEvent(payload: unknown): WebhookEvent {
    return parseWebhookEvent(payload);
  }

  /**
   * Verify webhook authentication header
   */
  verifyAuth(headers: WebhookHeaders, auth: WebhookAuthConfig): boolean {
    return verifyWebhookAuth(headers, auth);
  }

  /**
   * Framework-agnostic webhook handler
   */
  handle(options: HandleWebhookOptions): WebhookHandlerResultWithFetch {
    return this.withFetchHelpers(handleWebhook(options));
  }

  /**
   * Handle a webhook from a Fetch API Request
   */
  async handleRequest(request: Request, auth?: WebhookAuthConfig): Promise<WebhookHandlerResultWithFetch> {
    const result = await handleWebhookRequest(request, auth);
    return this.withFetchHelpers(result);
  }

  /**
   * Handle a webhook from an Express-like request
   *
   * @example
   * ```typescript
   * app.post('/webhook', async (req, res) => {
   *     const result = soniox.webhooks.handleExpress(req);
   *
   *     if (result.ok && result.event.status === 'completed') {
   *         const transcript = await result.fetchTranscript();
   *         console.log(transcript?.text);
   *     }
   *
   *     res.status(result.status).json({ received: true });
   * });
   * ```
   */
  handleExpress(req: ExpressLikeRequest, auth?: WebhookAuthConfig): WebhookHandlerResultWithFetch {
    return this.withFetchHelpers(handleWebhookExpress(req, auth));
  }

  /**
   * Handle a webhook from a Fastify request
   */
  handleFastify(req: FastifyLikeRequest, auth?: WebhookAuthConfig): WebhookHandlerResultWithFetch {
    return this.withFetchHelpers(handleWebhookFastify(req, auth));
  }

  /**
   * Handle a webhook from a NestJS request
   */
  handleNestJS(req: NestJSLikeRequest, auth?: WebhookAuthConfig): WebhookHandlerResultWithFetch {
    return this.withFetchHelpers(handleWebhookNestJS(req, auth));
  }

  /**
   * Handle a webhook from a Hono context
   */
  async handleHono(c: HonoLikeContext, auth?: WebhookAuthConfig): Promise<WebhookHandlerResultWithFetch> {
    const result = await handleWebhookHono(c, auth);
    return this.withFetchHelpers(result);
  }
}
