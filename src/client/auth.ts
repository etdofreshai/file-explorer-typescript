/**
 * Client-side auth state for the UI access token gate.
 *
 * The configured token (UI_ACCESS_TOKEN) lives ONLY on the server — it is
 * never sent to the client bundle.  This module only manages the token the
 * user enters at login time, stores it in localStorage so the session
 * persists across page reloads, and attaches it to every API request as
 * the `x-auth-token` header for server-side validation.
 */

/** localStorage key used to persist the auth token across page reloads. */
export const AUTH_STORAGE_KEY = 'file-explorer-auth-token';

/** Returns the token stored in localStorage, or null if absent. */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the token to localStorage. */
export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  } catch {
    // localStorage unavailable (e.g. private browsing restriction) — non-fatal
  }
}

/** Removes the stored token (logout / lock). */
export function clearStoredToken(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}

/**
 * A drop-in replacement for `fetch` that automatically attaches the stored
 * auth token as the `x-auth-token` request header.
 *
 * When no token is stored (auth disabled or not yet authenticated),
 * the request is forwarded unchanged.
 */
export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('x-auth-token', token);
  return fetch(input, { ...init, headers });
}

/**
 * Appends the stored auth token to a URL as a `?t=...` query parameter so the
 * server's auth gate accepts requests that can't set custom headers — i.e.
 * `<a href download>`, `<video src>`, `<audio src>`, `<img src>`, `<iframe src>`.
 *
 * If no token is stored (auth disabled or not yet authenticated), returns the
 * URL unchanged.
 */
export function authUrl(url: string): string {
  const token = getStoredToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${encodeURIComponent(token)}`;
}
