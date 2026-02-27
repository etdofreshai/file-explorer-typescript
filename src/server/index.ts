import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { browseRouter } from './routes/browse.js';
import { errorHandler } from './middleware/errorHandler.js';

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', exploreRoot: EXPLORE_ROOT, writeEnabled: WRITE_ENABLED });
});

// API routes
app.use('/api/browse', browseRouter);

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
});
