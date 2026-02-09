import type { ISonioxTranscript, ISonioxTranscription } from './transcriptions.js';

/**
 * Webhook event status values
 */
export type WebhookEventStatus = 'completed' | 'error';

/**
 * Webhook event payload sent by Soniox when a transcription completes or fails.
 */
export type WebhookEvent = {
  /**
   * Transcription ID
   * @format uuid
   */
  id: string;

  /**
   * Transcription result status
   */
  status: WebhookEventStatus;
};

/**
 * Authentication configuration for webhook verification
 */
export type WebhookAuthConfig = {
  /**
   * Expected header name (case-insensitive comparison)
   */
  name: string;

  /**
   * Expected header value (exact match)
   */
  value: string;
};

/**
 * Headers object type - supports both standard headers and record types
 */
export type WebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null };

/**
 * Result of webhook handling
 */
export type WebhookHandlerResult = {
  /**
   * Whether the webhook was handled successfully
   */
  ok: boolean;

  /**
   * HTTP status code to return
   */
  status: number;

  /**
   * Parsed webhook event (only present when ok=true)
   */
  event?: WebhookEvent;

  /**
   * Error message (only present when ok=false)
   */
  error?: string;
};

/**
 * Result of webhook handling with lazy fetch capabilities.
 *
 * When using `client.webhooks.handleExpress()` (or other framework handlers),
 * the result includes helper methods to fetch the transcript or transcription.
 */
export type WebhookHandlerResultWithFetch = WebhookHandlerResult & {
  /**
   * Fetch the transcript for a completed transcription.
   * Only available when `ok=true` and `event.status='completed'`.
   *
   * @returns The transcript with text and tokens, or null if not found
   *
   * @example
   * ```typescript
   * const result = soniox.webhooks.handleExpress(req);
   * if (result.ok && result.event.status === 'completed') {
   *     const transcript = await result.fetchTranscript();
   *     console.log(transcript?.text);
   * }
   * ```
   */
  fetchTranscript: (() => Promise<ISonioxTranscript | null>) | undefined;

  /**
   * Fetch the full transcription object.
   * Useful for both completed (metadata) and error (error details) statuses.
   *
   * @returns The transcription object, or null if not found
   *
   * @example
   * ```typescript
   * const result = soniox.webhooks.handleExpress(req);
   * if (result.ok && result.event.status === 'error') {
   *     const transcription = await result.fetchTranscription();
   *     console.log(transcription?.error_message);
   * }
   * ```
   */
  fetchTranscription: (() => Promise<ISonioxTranscription | null>) | undefined;
};

/**
 * Options for the handleWebhook function
 */
export type HandleWebhookOptions = {
  /**
   * HTTP method of the request
   */
  method: string;

  /**
   * Request headers
   */
  headers: WebhookHeaders;

  /**
   * Request body (parsed JSON or raw string)
   */
  body: unknown;

  /**
   * Optional authentication configuration
   */
  auth?: WebhookAuthConfig;
};

/**
 * Express/Connect-style request object
 */
export type ExpressLikeRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

/**
 * Fastify-style request object
 */
export type FastifyLikeRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

/**
 * NestJS-style request object (uses Express under the hood by default)
 */
export type NestJSLikeRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

/**
 * Hono context object
 */
export type HonoLikeContext = {
  req: {
    method: string;
    header(name: string): string | undefined;
    json(): Promise<unknown>;
  };
};
