/**
 * Platform capability detection for audio capture.
 */

/**
 * Reason why the built-in browser `MicrophoneSource` is unavailable:
 *
 * - `'ssr'` — `navigator` is undefined (SSR, React Native, or other non-browser JS runtimes).
 * - `'no-mediadevices'` — `navigator` exists but `navigator.mediaDevices` is missing.
 * - `'no-getusermedia'` — `navigator.mediaDevices` exists but `getUserMedia` is not a function.
 * - `'insecure-context'` — the page is not served over HTTPS.
 *
 * This only reflects whether the **default** `MicrophoneSource` can work.
 * Custom `AudioSource` implementations (e.g. for React Native) bypass this
 * check entirely and can record regardless of this value.
 */
export type UnsupportedReason = 'ssr' | 'no-mediadevices' | 'no-getusermedia' | 'insecure-context';

export interface AudioSupportResult {
  isSupported: boolean;
  reason?: UnsupportedReason | undefined;
}

/**
 * Check whether the current environment supports the built-in browser
 * `MicrophoneSource` (which uses `navigator.mediaDevices.getUserMedia`).
 *
 * This does **not** reflect general recording capability — custom `AudioSource`
 * implementations (e.g. for React Native) bypass this check entirely and can
 * record regardless of the result.
 *
 * @platform browser
 */
export function checkAudioSupport(): AudioSupportResult {
  if (typeof navigator === 'undefined') {
    return { isSupported: false, reason: 'ssr' };
  }

  if (typeof window !== 'undefined' && 'isSecureContext' in window && !window.isSecureContext) {
    return { isSupported: false, reason: 'insecure-context' };
  }

  if (typeof navigator.mediaDevices === 'undefined') {
    return { isSupported: false, reason: 'no-mediadevices' };
  }

  if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return { isSupported: false, reason: 'no-getusermedia' };
  }

  return { isSupported: true };
}

/**
 * Returns `true` when running in a browser-like environment with
 * `navigator.mediaDevices` available.
 *
 * Used internally to decide whether to auto-apply `BrowserPermissionResolver`.
 * Returns `false` in SSR, React Native, and non-browser JS runtimes.
 */
export function isBrowserEnvironment(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices;
}
