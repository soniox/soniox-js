/**
 * Main Soniox client for Node.js
 */

import type { SonioxClientConfig } from '@soniox/core';

export interface SonioxClientOptions extends Partial<SonioxClientConfig> {
  apiKey: string;
}

/**
 * Soniox API client
 *
 * @example
 * ```typescript
 * const soniox = new SonioxClient();
 * ```
 */
export class SonioxClient {
  constructor(_options: SonioxClientOptions) {}
}
