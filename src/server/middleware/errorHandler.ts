import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error & { code?: string; status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err);

  // Handle specific error types
  if (err.code === 'ENOENT') {
    res.status(404).json({ error: 'File or directory not found' });
    return;
  }

  if (err.code === 'EACCES') {
    res.status(403).json({ error: 'Permission denied' });
    return;
  }

  if (err.code === 'ENOTDIR') {
    res.status(400).json({ error: 'Not a directory' });
    return;
  }

  if (err.code === 'EISDIR') {
    res.status(400).json({ error: 'Is a directory' });
    return;
  }

  // Default error
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;
  
  res.status(status).json({ error: message });
}
