/**
 * Write guard utilities for the file editor.
 *
 * These helpers are extracted as pure functions so they can be
 * unit-tested independently of Express routing logic.
 */

/** Maximum allowed write size in bytes (default 5 MB). */
export const DEFAULT_MAX_WRITE_BYTES = 5 * 1024 * 1024;

/**
 * Returns true when write mode has been explicitly opted-in.
 * The ENABLE_WRITE env var must be the exact string "true" (case-sensitive).
 */
export function isWriteEnabled(): boolean {
  return process.env.ENABLE_WRITE === 'true';
}

/**
 * Returns true when the UTF-8 byte length of `content` exceeds `maxBytes`.
 *
 * Using the byte count (not character count) correctly handles multibyte
 * characters (emoji, CJK, etc.).
 */
export function isContentTooLarge(
  content: string,
  maxBytes: number = DEFAULT_MAX_WRITE_BYTES,
): boolean {
  return Buffer.byteLength(content, 'utf8') > maxBytes;
}

/**
 * Returns true when the client-supplied `clientMtime` differs from
 * `serverMtime` by more than `toleranceMs` milliseconds.
 *
 * A mismatch means the file was modified on disk after the client loaded it
 * → we should refuse the write (HTTP 409 Conflict).
 *
 * Returns false (no conflict) when:
 *   - `clientMtime` is null / undefined (client opted out of the check)
 *   - `clientMtime` is not a parseable date string
 */
export function isMtimeConflict(
  serverMtime: Date,
  clientMtime: string | undefined | null,
  toleranceMs = 1000,
): boolean {
  if (clientMtime === undefined || clientMtime === null) {
    return false;
  }
  const clientMs = new Date(clientMtime).getTime();
  if (isNaN(clientMs)) {
    return false; // Unparseable date — skip conflict check
  }
  return Math.abs(clientMs - serverMtime.getTime()) > toleranceMs;
}
