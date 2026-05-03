import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import mime from 'mime-types';
import { sanitizePath, isPathWithinRoot } from '../utils/pathUtils.js';
import { isWriteEnabled, isContentTooLarge, isMtimeConflict } from '../utils/writeGuard.js';

/**
 * MIME-type overrides for file extensions that `mime-types` gets wrong or
 * doesn't know about.  All code/config extensions are mapped to a text/* type
 * so the server marks them as previewable and the browser won't force-download
 * them.
 *
 * Notably, `.ts` is mapped to text/plain because mime-types incorrectly returns
 * `video/mp2t` (MPEG-2 Transport Stream) for it.
 */
const CODE_MIME_OVERRIDES: Record<string, string> = {
  // TypeScript (mime-types returns video/mp2t — wrong!)
  '.ts': 'text/plain',
  '.tsx': 'text/plain',
  // JavaScript variants not covered by mime-types
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  // Systems / compiled languages
  '.go': 'text/plain',
  '.rs': 'text/plain',
  '.cs': 'text/plain',
  '.cpp': 'text/plain',
  '.cxx': 'text/plain',
  '.cc': 'text/plain',
  '.c': 'text/plain',
  '.h': 'text/plain',
  '.hpp': 'text/plain',
  '.hxx': 'text/plain',
  // JVM / CLR
  '.kt': 'text/plain',
  '.kts': 'text/plain',
  '.scala': 'text/plain',
  '.groovy': 'text/plain',
  // Mobile
  '.swift': 'text/plain',
  '.dart': 'text/plain',
  // Scripting
  '.rb': 'text/plain',
  '.lua': 'text/plain',
  '.r': 'text/plain',
  '.pl': 'text/plain',
  '.pm': 'text/plain',
  '.ps1': 'text/plain',
  // Config / data
  '.toml': 'text/plain',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.env': 'text/plain',
  '.properties': 'text/plain',
  // Web frameworks
  '.vue': 'text/plain',
  '.svelte': 'text/plain',
  '.astro': 'text/plain',
  '.scss': 'text/css',
  '.sass': 'text/css',
  '.less': 'text/css',
  // Query / schema
  '.sql': 'text/plain',
  '.graphql': 'text/plain',
  '.gql': 'text/plain',
  '.proto': 'text/plain',
  '.tf': 'text/plain',
  '.hcl': 'text/plain',
  // Misc text
  '.log': 'text/plain',
  '.diff': 'text/plain',
  '.patch': 'text/plain',
  '.lock': 'text/plain',
};

/**
 * Returns the MIME type for a filename, applying code-file overrides before
 * falling back to the `mime-types` library.
 */
function getFileMimeType(filename: string): string | false {
  const ext = path.extname(filename).toLowerCase();
  if (CODE_MIME_OVERRIDES[ext]) {
    return CODE_MIME_OVERRIDES[ext];
  }
  return mime.lookup(filename);
}

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
        // stat() follows symlinks; fall back to lstat() for broken links so the
        // listing isn't aborted by a single dangling symlink.
        let entryStats: Awaited<ReturnType<typeof fs.stat>>;
        let broken = false;
        try {
          entryStats = await fs.stat(entryPath);
        } catch (err: any) {
          if (err?.code === 'ENOENT' || err?.code === 'ELOOP') {
            entryStats = await fs.lstat(entryPath);
            broken = true;
          } else {
            throw err;
          }
        }
        const isDir = broken ? false : entryStats.isDirectory();
        const isFile = broken ? false : entryStats.isFile();
        const mimeType = isFile ? getFileMimeType(entry.name) || 'application/octet-stream' : null;

        return {
          name: entry.name,
          type: isDir ? 'directory' : 'file',
          size: isFile ? entryStats.size : null,
          modified: entryStats.mtime,
          mimeType,
          isPreviewable: isFile ? isPreviewable(mimeType) : false,
          broken: broken || undefined,
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

    const mimeType = getFileMimeType(fullPath) || 'application/octet-stream';
    const fileSize = stats.size;

    // Allow the client to force a download regardless of preview-ability via ?download=1
    const forceDownload = req.query.download === '1' || req.query.download === 'true';
    const previewable = isPreviewable(mimeType);
    const disposition = forceDownload ? 'attachment' : (previewable ? 'inline' : 'attachment');

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(fullPath)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    // Range request support — required for video/audio seeking
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (match) {
        const startStr = match[1];
        const endStr = match[2];
        let start = startStr ? parseInt(startStr, 10) : 0;
        let end = endStr ? parseInt(endStr, 10) : fileSize - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
          res.end();
          return;
        }
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize);
        createReadStream(fullPath, { start, end }).pipe(res);
        return;
      }
    }

    res.setHeader('Content-Length', fileSize);
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

    const mimeType = getFileMimeType(fullPath) || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

// PUT /api/browse/file - Write file contents (requires ENABLE_WRITE=true)
router.put('/file', async (req: Request, res: Response, next: NextFunction) => {
  // Write guard — must be explicitly opted-in
  if (!isWriteEnabled()) {
    res.status(403).json({ error: 'Write mode is disabled. Set ENABLE_WRITE=true to enable.' });
    return;
  }

  try {
    const requestedPath = req.query.path as string;

    if (!requestedPath) {
      res.status(400).json({ error: 'Path parameter required' });
      return;
    }

    const { content, mtime } = req.body as { content?: unknown; mtime?: unknown };

    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Request body must include a "content" string field' });
      return;
    }

    // Max file size guard
    if (isContentTooLarge(content)) {
      res.status(413).json({ error: 'File too large. Maximum write size is 5 MB.' });
      return;
    }

    const sanitized = sanitizePath(requestedPath);
    const fullPath = path.join(ROOT_DIR, sanitized);

    // Security: Ensure path is within root
    if (!isPathWithinRoot(fullPath, ROOT_DIR)) {
      res.status(403).json({ error: 'Access denied: path traversal attempt' });
      return;
    }

    // Stat the target file — it must already exist (no arbitrary file creation)
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(fullPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      throw err;
    }

    if (!stats.isFile()) {
      res.status(400).json({ error: 'Not a file' });
      return;
    }

    // Conflict detection: reject if file was modified after the client loaded it
    const clientMtime = typeof mtime === 'string' ? mtime : null;
    if (isMtimeConflict(stats.mtime, clientMtime)) {
      res.status(409).json({
        error: 'Conflict: file was modified since you opened it. Reload and try again.',
        serverMtime: stats.mtime.toISOString(),
      });
      return;
    }

    // Atomic write: temp file → rename
    const tmpPath = `${fullPath}.tmp.${Date.now()}`;
    try {
      await fs.writeFile(tmpPath, content, 'utf8');
      await fs.rename(tmpPath, fullPath);
    } catch (writeErr) {
      // Best-effort cleanup of temp file
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw writeErr;
    }

    const newStats = await fs.stat(fullPath);
    res.json({
      success: true,
      mtime: newStats.mtime.toISOString(),
      size: newStats.size,
    });
  } catch (error) {
    next(error);
  }
});

function isPreviewable(mimeType: string | null | false): boolean {
  if (!mimeType) return false;

  // Any text/* type is previewable (covers text/plain, text/html, text/css,
  // text/javascript, text/yaml, text/markdown, etc.)
  if (mimeType.startsWith('text/')) return true;

  const previewableExact: ReadonlySet<string> = new Set([
    'application/json',
    'application/javascript',
    'application/ecmascript',
    'application/x-sh',
    'application/x-shellscript',
    'application/xml',
    'application/sql',
    'application/pdf',
    'image/svg+xml',
  ]);
  if (previewableExact.has(mimeType)) return true;

  // Images, audio, and video
  if (mimeType.startsWith('image/')) return true;
  if (mimeType.startsWith('audio/')) return true;
  if (mimeType.startsWith('video/')) return true;

  return false;
}

export { router as browseRouter };
