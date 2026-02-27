import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { browseRouter } from './routes/browse.js';
import { errorHandler } from './middleware/errorHandler.js';
import { isAuthRequired, isValidToken } from './utils/authGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const EXPLORE_ROOT = process.env.EXPLORE_ROOT || '/explore';
// Default: serve dist/client relative to this file (dist/server/index.js → dist/client/)
// This works regardless of where the container mounts the app, no env var required.
const defaultServeRoot = path.resolve(__dirname, '..', 'client');
const SERVE_APP_ROOT = process.env.SERVE_APP_ROOT || defaultServeRoot;

// Write mode: opt-in via ENABLE_WRITE=true
// ⚠️  Security: enabling write mode allows any browser client to overwrite
//    files within EXPLORE_ROOT. Only enable on trusted, private networks.
const WRITE_ENABLED = process.env.ENABLE_WRITE === 'true';

// Middleware
app.use(cors());
// Allow up to 6 MB JSON bodies so the write endpoint can handle ≤5 MB content
app.use(express.json({ limit: '6mb' }));

// ── Auth middleware ────────────────────────────────────────────────────────────
// When UI_ACCESS_TOKEN is set, all /api/browse routes require the token in
// the x-auth-token header. The token is never exposed to the client bundle.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthRequired()) {
    next();
    return;
  }
  const clientToken = req.headers['x-auth-token'] as string | undefined;
  if (!isValidToken(clientToken)) {
    res.status(401).json({ error: 'Unauthorized. Provide a valid x-auth-token header.' });
    return;
  }
  next();
}

// Health check (unauthenticated — safe: no file data)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', exploreRoot: EXPLORE_ROOT, writeEnabled: WRITE_ENABLED });
});

// ── Auth endpoints (public — must come before requireAuth middleware) ─────────

// GET /api/auth-required — tells the client whether a token gate is active.
// Never reveals the token itself.
app.get('/api/auth-required', (_req, res) => {
  res.json({ required: isAuthRequired() });
});

// POST /api/auth — validates the supplied token server-side.
// Body: { token: string }
// Returns: { ok: true } on success, { ok: false, error: string } on failure.
app.post('/api/auth', (req, res) => {
  if (!isAuthRequired()) {
    res.json({ ok: true });
    return;
  }
  const { token } = (req.body || {}) as { token?: unknown };
  if (typeof token !== 'string' || !isValidToken(token)) {
    res.status(401).json({ ok: false, error: 'Invalid token' });
    return;
  }
  res.json({ ok: true });
});

// ── Protected API routes ───────────────────────────────────────────────────────
// All /api/browse routes are protected when UI_ACCESS_TOKEN is set.
app.use('/api/browse', requireAuth, browseRouter);

// Serve static files from /app directory in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = SERVE_APP_ROOT;
  app.use(express.static(clientPath));
  
  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`File Explorer API running on port ${PORT}`);
  console.log(`Exploring: ${EXPLORE_ROOT}`);
  console.log(`Serving app from: ${SERVE_APP_ROOT}`);
  console.log(`Write mode: ${WRITE_ENABLED ? '⚠️  ENABLED (ENABLE_WRITE=true)' : 'disabled (read-only)'}`);
  console.log(`Auth gate: ${isAuthRequired() ? '🔒 ENABLED (UI_ACCESS_TOKEN is set)' : 'disabled (open access)'}`);
});
