import { FileExplorer } from './FileExplorer.js';
import {
  AUTH_STORAGE_KEY,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from './auth.js';

// ── Theme ────────────────────────────────────────────────────────────────────

const THEME_KEY = 'file-explorer-theme';
type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const sunIcon  = document.getElementById('icon-sun');
  const moonIcon = document.getElementById('icon-moon');

  if (sunIcon && moonIcon) {
    // In dark mode show the sun (click → go light); in light mode show the moon (click → go dark)
    sunIcon.style.display  = theme === 'dark'  ? '' : 'none';
    moonIcon.style.display = theme === 'light' ? '' : 'none';
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  // Default to dark on first visit
  const theme: Theme = saved === 'light' ? 'light' : 'dark';
  applyTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') as Theme;
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Apply theme before first paint
initTheme();

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

// ── Auth Gate ────────────────────────────────────────────────────────────────

const authOverlay = document.getElementById('auth-overlay') as HTMLElement | null;
const authForm    = document.getElementById('auth-form') as HTMLFormElement | null;
const authInput   = document.getElementById('auth-token-input') as HTMLInputElement | null;
const authError   = document.getElementById('auth-error') as HTMLElement | null;
const lockBtn     = document.getElementById('lock-btn') as HTMLButtonElement | null;

/** Show the auth modal and hide the main app content. */
function showAuthModal(message = '') {
  if (authOverlay) {
    authOverlay.classList.add('visible');
    authOverlay.setAttribute('aria-hidden', 'false');
  }
  if (authInput) {
    authInput.value = '';
    authInput.focus();
  }
  if (authError) authError.textContent = message;
  // Hide the main app so it can't be interacted with behind the overlay
  const appContent = document.getElementById('app-content');
  if (appContent) appContent.inert = true;
}

/** Hide the auth modal and show the main app content. */
function hideAuthModal() {
  if (authOverlay) {
    authOverlay.classList.remove('visible');
    authOverlay.setAttribute('aria-hidden', 'true');
  }
  const appContent = document.getElementById('app-content');
  if (appContent) appContent.inert = false;
  // Show the lock button now that the user is authenticated
  if (lockBtn) lockBtn.style.display = '';
}

/** Submit the token to the server for validation. */
async function submitToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json() as { ok: boolean; error?: string };
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * Initialise the auth gate:
 *   1. Ask server if auth is required.
 *   2. If not required → proceed directly.
 *   3. If required → try persisted token first; prompt if invalid/absent.
 *
 * Returns true when the caller may proceed to boot the app.
 * The function sets up the form submit + lock button listeners as side effects.
 */
async function initAuth(): Promise<boolean> {
  let required = false;

  try {
    const res = await fetch('/api/auth-required');
    const data = await res.json() as { required: boolean };
    required = data.required === true;
  } catch {
    // Server unreachable — skip auth (fail-open so the app still loads)
    return true;
  }

  if (!required) {
    // No token configured — keep lock button hidden
    if (lockBtn) lockBtn.style.display = 'none';
    return true;
  }

  // Auth is required — try the persisted token first
  const stored = getStoredToken();
  if (stored) {
    const ok = await submitToken(stored);
    if (ok) {
      // Persisted token is still valid
      hideAuthModal();
      return true;
    }
    // Token is stale/wrong — clear it and ask again
    clearStoredToken();
  }

  // Show modal and wait for the user to submit a valid token
  showAuthModal();

  return new Promise((resolve) => {
    authForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = authInput?.value?.trim() ?? '';

      if (!token) {
        if (authError) authError.textContent = 'Please enter a token.';
        return;
      }

      const submitBtn = document.getElementById('auth-submit-btn') as HTMLButtonElement | null;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking…'; }
      if (authError) authError.textContent = '';

      const ok = await submitToken(token);

      if (ok) {
        setStoredToken(token);
        hideAuthModal();
        resolve(true);
      } else {
        if (authError) authError.textContent = 'Invalid token. Please try again.';
        if (authInput) { authInput.value = ''; authInput.focus(); }
      }

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Unlock'; }
    });
  });
}

/** Lock the explorer: clear stored token and re-show the auth gate. */
function lockExplorer() {
  clearStoredToken();
  // Re-check auth to show the modal (in practice this just re-shows the prompt
  // without a page reload — the token is gone so the user must re-enter it)
  showAuthModal();

  // Re-wire the form for the new session (replace previous one-shot listener
  // by cloning the node — simplest way to remove all listeners)
  const oldForm = document.getElementById('auth-form');
  if (oldForm) {
    const newForm = oldForm.cloneNode(true) as HTMLFormElement;
    oldForm.replaceWith(newForm);
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('auth-token-input') as HTMLInputElement | null;
      const error = document.getElementById('auth-error') as HTMLElement | null;
      const token = input?.value?.trim() ?? '';

      if (!token) {
        if (error) error.textContent = 'Please enter a token.';
        return;
      }

      const submitBtn = document.getElementById('auth-submit-btn') as HTMLButtonElement | null;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking…'; }
      if (error) error.textContent = '';

      const ok = await submitToken(token);
      if (ok) {
        setStoredToken(token);
        hideAuthModal();
      } else {
        if (error) error.textContent = 'Invalid token. Please try again.';
        if (input) { input.value = ''; input.focus(); }
      }

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Unlock'; }
    });
  }
}

// Lock button wires up after the DOM is ready (always attached, hidden when no auth)
lockBtn?.addEventListener('click', lockExplorer);

// ── App ──────────────────────────────────────────────────────────────────────

// Boot sequence: auth check, then initialise the file explorer
(async () => {
  const authOk = await initAuth();
  if (!authOk) return; // shouldn't happen with current fail-open logic

  // Initialize the file explorer
  const explorer = new FileExplorer();

  // Expose for debugging
  (window as any).explorer = explorer;
  // Expose lock function for console debugging
  (window as any)._lockExplorer = lockExplorer;
})();

// ── Error helpers ─────────────────────────────────────────────────────────────

function showError(message: string) {
  const toast = document.getElementById('error-toast');
  const messageEl = document.getElementById('error-message');
  if (toast && messageEl) {
    messageEl.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 5000);
  }
}

function hideError() {
  const toast = document.getElementById('error-toast');
  if (toast) {
    toast.classList.remove('visible');
  }
}

// Make hideError globally available
(window as any).hideError = hideError;

// Export showError for use in FileExplorer
export { showError, hideError, AUTH_STORAGE_KEY };
