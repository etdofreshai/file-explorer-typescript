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
const SERVE_APP_ROOT = process.env.SERVE_APP_ROOT || '/app';

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', exploreRoot: EXPLORE_ROOT });
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
});
