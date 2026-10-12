import type { AuthTransport } from '../types/realtime.js';

/**
 * Second argument to the WebSocket constructor, carrying the API key.
 *
 * Either the standard `protocols` list, or a non-standard options bag that
 * only some runtimes (e.g. Node) accept in that position.
 */
export type HandshakeAuthArg = string[] | { headers: { Authorization: string } };

/**
 * Build the WebSocket constructor argument that carries the API key.
 *
 * Unset defaults to `'protocol-list'`, which every WebSocket implementation
 * accepts. Wrapping packages pick `'headers'` where they know it works.
 */
export function handshakeAuthArg(apiKey: string, transport: AuthTransport | undefined): HandshakeAuthArg {
  return (transport ?? 'protocol-list') === 'protocol-list'
    ? ['soniox-api-key', apiKey]
    : { headers: { Authorization: `Bearer ${apiKey}` } };
}
