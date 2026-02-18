/**
 * Browser implementation of PermissionResolver.
 *
 * Uses `navigator.permissions.query` (with Safari fallback) for checking
 * and `getUserMedia` for requesting microphone permission.
 */

import type { PermissionResolver, PermissionResult, PermissionType } from './types.js';

/**
 * Browser permission resolver for checking and requesting microphone access.
 *
 * @example
 * ```typescript
 * const resolver = new BrowserPermissionResolver();
 * const mic = await resolver.check('microphone');
 * if (mic.status === 'prompt') {
 *   const result = await resolver.request('microphone');
 *   if (result.status === 'denied') {
 *     showDeniedMessage();
 *   }
 * }
 * ```
 */
export class BrowserPermissionResolver implements PermissionResolver {
  /**
   * Check current microphone permission status without prompting the user.
   */
  async check(permission: PermissionType): Promise<PermissionResult> {
    if (permission === 'microphone') {
      return this.checkMicrophone();
    }
    return { status: 'unavailable', can_request: false };
  }

  /**
   * Request microphone permission from the user.
   * This may show a browser permission prompt.
   */
  async request(permission: PermissionType): Promise<PermissionResult> {
    if (permission === 'microphone') {
      return this.requestMicrophone();
    }
    return { status: 'unavailable', can_request: false };
  }

  private async checkMicrophone(): Promise<PermissionResult> {
    // Try the Permissions API first
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        return {
          status: result.state === 'prompt' ? 'prompt' : result.state,
          can_request: result.state !== 'denied',
        };
      } catch {
        // Safari and some browsers don't support querying 'microphone'
        // Fall through to capability check
      }
    }

    // Fallback: check if getUserMedia is available at all
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { status: 'unavailable', can_request: false };
    }

    // Can't determine status without prompting
    return { status: 'prompt', can_request: true };
  }

  private async requestMicrophone(): Promise<PermissionResult> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { status: 'unavailable', can_request: false };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return { status: 'granted', can_request: true };
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          return { status: 'denied', can_request: false };
        }
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          return { status: 'unavailable', can_request: false };
        }
      }
      return { status: 'denied', can_request: false };
    }
  }
}
