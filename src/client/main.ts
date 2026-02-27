import { FileExplorer } from './FileExplorer.js';

// Initialize the file explorer
const explorer = new FileExplorer();

// Expose for debugging
(window as any).explorer = explorer;

// Global error handler
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
