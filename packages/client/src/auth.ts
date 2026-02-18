/**
 * API key configuration and resolution for client-side usage
 * Every recording session fetches a fresh key
 */

/**
 * API key configuration.
 *
 * - `string` - A pre-fetched temporary API key (e.g., injected from SSR)
 * - `() => Promise<string>` - An async function that fetches a fresh temporary key
 *   from your backend. Called once per recording session.
 *
 * @example
 * ```typescript
 * // Static key (for demos or SSR-injected keys)
 * const client = new SonioxClient({ api_key: 'temp:...' });
 *
 * // Async function (recommended for production)
 * const client = new SonioxClient({
 *   api_key: async () => {
 *     const res = await fetch('/api/get-temporary-key', { method: 'POST' });
 *     const { api_key } = await res.json();
 *     return api_key;
 *   },
 * });
 * ```
 *
 * Note: If you use Node.js, you can use the `SonioxNodeClient` to fetch a temporary API key via `client.auth.createTemporaryKey()`.
 */
export type ApiKeyConfig = string | (() => Promise<string>);

/**
 * Resolves an ApiKeyConfig to a plain API key string.
 * @param config - The API key configuration
 * @returns The resolved API key string
 * @throws If the function rejects or returns a non-string value
 */
export async function resolveApiKey(config: ApiKeyConfig): Promise<string> {
  if (typeof config === 'function') {
    const key = await config();
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('api_key function must return a non-empty string');
    }
    return key;
  }

  if (typeof config !== 'string' || config.length === 0) {
    throw new Error('api_key must be a non-empty string');
  }

  return config;
}
