import path from 'path';

/**
 * Sanitizes a user-provided path to prevent path traversal attacks.
 * Removes null bytes, normalizes slashes, and ensures the path starts with /
 * 
 * This function is designed to produce a "safe" relative path that, when joined
 * with a root directory, cannot escape that root. It achieves this by treating
 * all `..` segments as if they were removed at the start.
 * 
 * @param inputPath - The user-provided path to sanitize
 * @returns A normalized, safe relative path starting with /
 */
export function sanitizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    return '/';
  }

  // Remove null bytes (prevents null byte injection)
  let sanitized = inputPath.replace(/\0/g, '');

  // Normalize slashes - convert backslashes to forward slashes
  sanitized = sanitized.replace(/\\/g, '/');

  // Remove multiple consecutive slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  // Ensure path starts with /
  if (!sanitized.startsWith('/')) {
    sanitized = '/' + sanitized;
  }

  // Process path segments - treat this as a virtual filesystem where
  // we start at root and can never go above it
  const segments = sanitized.split('/').filter(Boolean);
  const resultSegments: string[] = [];

  for (const segment of segments) {
    // Skip empty segments
    if (!segment) continue;

    // Block parent directory traversal - we're already at root conceptually
    // so any .. is ignored (can't go above root)
    if (segment === '..') {
      // Pop the last segment if we have one (simulate going up)
      // But if we're at the virtual root, ignore it
      if (resultSegments.length > 0) {
        resultSegments.pop();
      }
      continue;
    }

    // Skip current directory references
    if (segment === '.') {
      continue;
    }

    resultSegments.push(segment);
  }

  return resultSegments.length === 0 ? '/' : '/' + resultSegments.join('/');
}

/**
 * Checks if an absolute path is within the allowed root directory.
 * This is a secondary check that should be used after joining the sanitized
 * path with the root.
 * 
 * @param targetPath - The absolute path to check
 * @param rootPath - The allowed root directory
 * @returns true if the path is within root, false otherwise
 */
export function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  try {
    // Normalize and resolve both paths
    const normalizedTarget = path.normalize(targetPath);
    const normalizedRoot = path.normalize(rootPath);

    // Get absolute paths
    const absoluteTarget = path.resolve(normalizedTarget);
    const absoluteRoot = path.resolve(normalizedRoot);

    // The target should start with the root path
    // Add a trailing slash to prevent /app matching /app-data
    const rootWithSlash = absoluteRoot.endsWith(path.sep) 
      ? absoluteRoot 
      : absoluteRoot + path.sep;

    // Check if target is the root itself or within root
    if (absoluteTarget === absoluteRoot) {
      return true;
    }

    return absoluteTarget.startsWith(rootWithSlash);
  } catch {
    return false;
  }
}

/**
 * Creates a safe path by combining root with a sanitized relative path.
 * This is a convenience function that combines sanitizePath and isPathWithinRoot.
 * 
 * @param rootPath - The root directory
 * @param relativePath - The user-provided relative path
 * @returns The safe absolute path, or null if the path would escape root
 */
export function createSafePath(rootPath: string, relativePath: string): string | null {
  const sanitized = sanitizePath(relativePath);
  const fullPath = path.join(rootPath, sanitized);

  if (!isPathWithinRoot(fullPath, rootPath)) {
    return null;
  }

  return fullPath;
}
