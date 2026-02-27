/**
 * Auth guard utilities for the UI access token gate.
 *
 * Extracted as pure functions for testability.
 * The actual token is never sent to the client — it lives only in server env vars.
 *
 * Env var: UI_ACCESS_TOKEN
 *   - Not set / empty → auth disabled (open access)
 *   - Set to any non-empty string → all /api/browse requests require the token
 *     in the `x-auth-token` request header.
 */

import { timingSafeEqual } from 'crypto';

/**
 * Returns true when UI access-token authentication is enabled.
 * Auth is enabled iff UI_ACCESS_TOKEN is set to a non-empty string.
 */
export function isAuthRequired(): boolean {
  const token = process.env.UI_ACCESS_TOKEN;
  return typeof token === 'string' && token.length > 0;
}

/**
 * Returns true when the supplied `clientToken` matches the configured token.
 *
 * Security notes:
 *   - If auth is disabled (UI_ACCESS_TOKEN not set), always returns true.
 *   - Comparison happens server-side using timingSafeEqual to prevent
 *     timing-based token inference attacks.
 *   - The configured token is NEVER sent to the client bundle.
 */
export function isValidToken(clientToken: string | undefined | null): boolean {
  const configured = process.env.UI_ACCESS_TOKEN;

  // Auth disabled → always allow
  if (!configured) return true;

  // No token provided → deny
  if (!clientToken) return false;

  try {
    const a = Buffer.from(clientToken, 'utf8');
    const b = Buffer.from(configured, 'utf8');
    // Lengths must match for timingSafeEqual; early-out without leaking timing
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    // Fallback — still server-side, just not timing-safe
    return clientToken === configured;
  }
}
