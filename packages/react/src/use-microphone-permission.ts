/**
 * useMicrophonePermission — React hook for checking microphone permission
 * When no PermissionResolver is configured in the provider, status is `'unsupported'` (never null).
 */

import { useCallback, useRef, useState, useEffect } from 'react';

import { useSoniox } from './use-soniox.js';

/**
 * Possible permission statuses.
 *
 * `'granted' | 'denied' | 'prompt'` come from the underlying PermissionResolver
 * `'unavailable'` means the Permissions API itself is not available in this browser
 * `'unsupported'` means no PermissionResolver was configured in the provider
 * `'unknown'` is the initial state before the first `check()` call
 */
export type MicPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable' | 'unsupported' | 'unknown';

export interface MicrophonePermissionState {
  /** Current permission status. */
  status: MicPermissionStatus;
  /** Whether the permission can be requested (e.g., via a prompt). */
  canRequest: boolean;
  /** `status === 'granted'`. */
  isGranted: boolean;
  /** `status === 'denied'`. */
  isDenied: boolean;
  /** Whether permission checking is available. */
  isSupported: boolean;
  /** Check (or re-check) the microphone permission. No-op when unsupported. */
  check: () => Promise<void>;
}

export interface UseMicrophonePermissionOptions {
  /** Automatically check permission on mount. */
  autoCheck?: boolean | undefined;
}

const UNSUPPORTED_STATE: Omit<MicrophonePermissionState, 'check'> = Object.freeze({
  status: 'unsupported' as const,
  canRequest: false,
  isGranted: false,
  isDenied: false,
  isSupported: false,
});

export function useMicrophonePermission(options?: UseMicrophonePermissionOptions): MicrophonePermissionState {
  const client = useSoniox();
  const resolver = client.permissions;

  const [state, setState] = useState<Omit<MicrophonePermissionState, 'check'>>(() => {
    if (resolver === undefined) {
      return UNSUPPORTED_STATE;
    }
    return {
      status: 'unknown',
      canRequest: false,
      isGranted: false,
      isDenied: false,
      isSupported: true,
    };
  });

  const resolverRef = useRef(resolver);
  resolverRef.current = resolver;

  const check = useCallback(async (): Promise<void> => {
    const currentResolver = resolverRef.current;
    if (currentResolver === undefined) {
      return;
    }

    const result = await currentResolver.check('microphone');

    const status = result.status;
    setState({
      status,
      canRequest: result.can_request,
      isGranted: status === 'granted',
      isDenied: status === 'denied',
      isSupported: true,
    });
  }, []);

  useEffect(() => {
    if (options?.autoCheck === true && resolverRef.current !== undefined) {
      void check();
    }
  }, [options?.autoCheck, check]);

  return {
    ...state,
    check,
  };
}
