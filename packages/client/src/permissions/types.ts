/**
 * Platform-agnostic permission resolver interface
 */

/**
 * Unified permission status across all platforms.
 */
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * Result of a permission check or request.
 */
export type PermissionResult = {
  /**
   * Current permission status.
   */
  status: PermissionStatus;

  /**
   * Whether the user can be prompted again.
   * `false` means permanently denied (e.g., browser "Block" or iOS settings).
   * Useful for showing "go to settings" instructions.
   */
  can_request: boolean;
};

/**
 * Permission types supported by the resolver.
 */
export type PermissionType = 'microphone';

/**
 * Platform-agnostic permission resolver.
 *
 * Implementations handle platform-specific permission APIs:
 * - Browser: `navigator.permissions.query` + `getUserMedia`
 * - React Native: `expo-av` or `react-native-permissions`
 *
 * @example
 * ```typescript
 * // Check before recording
 * const mic = await resolver.check('microphone');
 * if (mic.status === 'denied' && !mic.can_request) {
 *   showGoToSettingsMessage();
 * }
 * ```
 */
export interface PermissionResolver {
  /**
   * Check current permission status WITHOUT prompting the user.
   */
  check(permission: PermissionType): Promise<PermissionResult>;

  /**
   * Request permission from the user (may show a system prompt).
   * On platforms where status is already 'granted', this is a no-op.
   */
  request(permission: PermissionType): Promise<PermissionResult>;
}
