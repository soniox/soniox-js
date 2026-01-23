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
