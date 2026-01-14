/**
 * Base error class for all Soniox SDK errors
 */

export class SonioxError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  constructor(message: string, code = 'SONIOX_ERROR') {
    super(message);
    this.name = 'SonioxError';
    this.code = code;

    // Maintains proper stack trace for where our error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
