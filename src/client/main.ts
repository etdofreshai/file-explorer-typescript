import { FileExplorer } from './FileExplorer.js';

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

// ── App ──────────────────────────────────────────────────────────────────────

// Initialize the file explorer
const explorer = new FileExplorer();

// Expose for debugging
(window as any).explorer = explorer;

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
export { showError, hideError };
