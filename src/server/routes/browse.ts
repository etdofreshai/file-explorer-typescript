import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import mime from 'mime-types';
import { sanitizePath, isPathWithinRoot } from '../utils/pathUtils.js';

const router = Router();
const ROOT_DIR = process.env.EXPLORE_ROOT || '/explore';

// GET /api/browse - List directory contents
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedPath = (req.query.path as string) || '/';
    const sanitized = sanitizePath(requestedPath);
    const fullPath = path.join(ROOT_DIR, sanitized);

    // Security: Ensure path is within root
    if (!isPathWithinRoot(fullPath, ROOT_DIR)) {
      res.status(403).json({ error: 'Access denied: path traversal attempt' });
      return;
    }

    const stats = await fs.stat(fullPath);

    if (!stats.isDirectory()) {
      res.status(400).json({ error: 'Not a directory' });
      return;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(fullPath, entry.name);
        const entryStats = await fs.stat(entryPath);
        const mimeType = entry.isFile() ? mime.lookup(entry.name) || 'application/octet-stream' : null;
        
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? entryStats.size : null,
          modified: entryStats.mtime,
          mimeType,
          isPreviewable: entry.isFile() ? isPreviewable(mimeType) : false,
        };
      })
    );

    // Sort: directories first, then files, both alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: sanitized,
      parent: sanitized !== '/' ? path.dirname(sanitized) : null,
      items,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/browse/file - Get file contents or download
router.get('/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedPath = req.query.path as string;
    
    if (!requestedPath) {
      res.status(400).json({ error: 'Path parameter required' });
      return;
    }

    const sanitized = sanitizePath(requestedPath);
    const fullPath = path.join(ROOT_DIR, sanitized);

    // Security: Ensure path is within root
    if (!isPathWithinRoot(fullPath, ROOT_DIR)) {
      res.status(403).json({ error: 'Access denied: path traversal attempt' });
      return;
    }

    const stats = await fs.stat(fullPath);

    if (!stats.isFile()) {
      res.status(400).json({ error: 'Not a file' });
      return;
    }

    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
    const fileSize = stats.size;

    // For previewable files, send inline; for others, force download
    const previewable = isPreviewable(mimeType);
    const disposition = previewable ? 'inline' : 'attachment';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(fullPath)}"`);
    res.setHeader('Content-Length', fileSize);

    // Stream the file (ESM-safe — no require())
    const fileStream = createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

// HEAD /api/browse/file - Get file info without content
router.head('/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedPath = req.query.path as string;
    
    if (!requestedPath) {
      res.status(400).json({ error: 'Path parameter required' });
      return;
    }

    const sanitized = sanitizePath(requestedPath);
    const fullPath = path.join(ROOT_DIR, sanitized);

    if (!isPathWithinRoot(fullPath, ROOT_DIR)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const stats = await fs.stat(fullPath);

    if (!stats.isFile()) {
      res.status(400).json({ error: 'Not a file' });
      return;
    }

    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

function isPreviewable(mimeType: string | null | false): boolean {
  if (!mimeType) return false;
  
  const previewableTypes = [
    'text/',
    'application/json',
    'image/',
    'audio/',
    'application/pdf',
  ];
  
  return previewableTypes.some(type => mimeType.startsWith(type));
}

export { router as browseRouter };
