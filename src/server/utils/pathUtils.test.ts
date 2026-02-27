import { sanitizePath, isPathWithinRoot, createSafePath } from './pathUtils';

describe('sanitizePath', () => {
  describe('basic normalization', () => {
    it('should return root for empty input', () => {
      expect(sanitizePath('')).toBe('/');
      expect(sanitizePath(null as any)).toBe('/');
      expect(sanitizePath(undefined as any)).toBe('/');
    });

    it('should normalize multiple slashes', () => {
      expect(sanitizePath('//')).toBe('/');
      expect(sanitizePath('///foo///bar')).toBe('/foo/bar');
    });

    it('should ensure path starts with /', () => {
      expect(sanitizePath('foo')).toBe('/foo');
      expect(sanitizePath('foo/bar')).toBe('/foo/bar');
    });

    it('should convert backslashes to forward slashes', () => {
      expect(sanitizePath('foo\\bar')).toBe('/foo/bar');
      expect(sanitizePath('..\\..\\etc')).toBe('/etc');
    });
  });

  describe('path traversal handling', () => {
    it('should normalize simple parent directory at root level', () => {
      expect(sanitizePath('/../')).toBe('/');
      expect(sanitizePath('/..')).toBe('/');
      expect(sanitizePath('../')).toBe('/');
    });

    it('should handle nested parent directory traversal', () => {
      // Going up from a subdirectory is allowed within the sanitized path
      expect(sanitizePath('/foo/../../bar')).toBe('/bar');
      expect(sanitizePath('/foo/bar/../../../etc/passwd')).toBe('/etc/passwd');
    });

    it('should handle mixed traversal attempts', () => {
      expect(sanitizePath('/foo/../bar/..')).toBe('/');
      expect(sanitizePath('/foo/./../bar')).toBe('/bar');
    });

    it('should normalize deep traversal to virtual root', () => {
      // These all normalize to a path starting from virtual root
      expect(sanitizePath('/../../../etc/passwd')).toBe('/etc/passwd');
      expect(sanitizePath('/../../../../../../etc/passwd')).toBe('/etc/passwd');
    });
  });

  describe('null byte injection prevention', () => {
    it('should remove null bytes', () => {
      expect(sanitizePath('/foo\u0000bar')).toBe('/foobar');
      expect(sanitizePath('/foo\u0000../../../etc')).toBe('/etc');
    });
  });

  describe('current directory handling', () => {
    it('should remove single dot segments', () => {
      expect(sanitizePath('/./foo')).toBe('/foo');
      expect(sanitizePath('/foo/./bar')).toBe('/foo/bar');
      expect(sanitizePath('./foo')).toBe('/foo');
    });
  });

  describe('valid paths', () => {
    it('should preserve valid paths', () => {
      expect(sanitizePath('/')).toBe('/');
      expect(sanitizePath('/foo')).toBe('/foo');
      expect(sanitizePath('/foo/bar')).toBe('/foo/bar');
      expect(sanitizePath('/foo/bar/baz.txt')).toBe('/foo/bar/baz.txt');
    });

    it('should handle paths with special characters', () => {
      expect(sanitizePath('/foo bar')).toBe('/foo bar');
      expect(sanitizePath('/foo-bar_baz')).toBe('/foo-bar_baz');
      expect(sanitizePath('/file.txt')).toBe('/file.txt');
    });
  });
});

describe('isPathWithinRoot', () => {
  const root = '/explore';

  describe('valid paths', () => {
    it('should allow root itself', () => {
      expect(isPathWithinRoot('/explore', root)).toBe(true);
    });

    it('should allow direct children of root', () => {
      expect(isPathWithinRoot('/explore/foo', root)).toBe(true);
      expect(isPathWithinRoot('/explore/bar', root)).toBe(true);
    });

    it('should allow nested paths within root', () => {
      expect(isPathWithinRoot('/explore/foo/bar', root)).toBe(true);
      expect(isPathWithinRoot('/explore/a/b/c/d/e', root)).toBe(true);
    });

    it('should handle paths with trailing slashes', () => {
      expect(isPathWithinRoot('/explore/', root)).toBe(true);
      expect(isPathWithinRoot('/explore/foo/', root)).toBe(true);
    });

    // SECURITY: This is the key test - even if sanitizePath normalizes
    // ../../../etc/passwd to /etc/passwd, when joined with /explore,
    // we get /explore/etc/passwd which IS within /explore
    it('should allow /explore/etc/passwd (within root)', () => {
      expect(isPathWithinRoot('/explore/etc/passwd', root)).toBe(true);
    });
  });

  describe('invalid paths', () => {
    it('should reject paths outside root', () => {
      expect(isPathWithinRoot('/etc', root)).toBe(false);
      expect(isPathWithinRoot('/var/log', root)).toBe(false);
      expect(isPathWithinRoot('/etc/passwd', root)).toBe(false);
    });

    it('should reject similar but different roots', () => {
      expect(isPathWithinRoot('/explore-data', root)).toBe(false);
      expect(isPathWithinRoot('/explorer', root)).toBe(false);
    });

    it('should reject parent directories of root', () => {
      expect(isPathWithinRoot('/', root)).toBe(false);
      expect(isPathWithinRoot('/home', root)).toBe(false);
    });
  });

  describe('path normalization handling', () => {
    it('should handle relative segments in target', () => {
      expect(isPathWithinRoot('/explore/foo/../bar', root)).toBe(true);
      // This is the key security check - /explore/../etc resolves to /etc
      expect(isPathWithinRoot('/explore/../etc', root)).toBe(false);
    });

    it('should handle multiple slashes', () => {
      expect(isPathWithinRoot('/explore///foo', root)).toBe(true);
    });
  });
});

describe('createSafePath', () => {
  const root = '/explore';

  it('should create safe paths for valid inputs', () => {
    expect(createSafePath(root, '/foo')).toBe('/explore/foo');
    expect(createSafePath(root, '/foo/bar')).toBe('/explore/foo/bar');
    expect(createSafePath(root, '/')).toBe('/explore/');
  });

  it('should sanitize and constrain to root', () => {
    // IMPORTANT: ../../../etc/passwd sanitizes to /etc/passwd
    // Then joins with /explore to get /explore/etc/passwd
    // This IS within root - user sees /explore/etc/passwd (if it exists)
    // They CANNOT escape to actual /etc/passwd
    expect(createSafePath(root, '../../../etc/passwd')).toBe('/explore/etc/passwd');
    expect(createSafePath(root, '/foo/../bar')).toBe('/explore/bar');
  });

  it('should sanitize traversal attempts to within root', () => {
    // /../../etc sanitizes to /etc, joins to /explore/etc
    // This is WITHIN /explore - user can't escape
    expect(createSafePath(root, '/../../etc')).toBe('/explore/etc');
  });

  it('should handle empty input', () => {
    expect(createSafePath(root, '')).toBe('/explore/');
    expect(createSafePath(root, '/')).toBe('/explore/');
  });
});

describe('Security: Full attack scenarios', () => {
  const root = '/explore';

  it('should prevent access to /etc/passwd', () => {
    // Attack: try to read /etc/passwd
    const attackVectors = [
      '../../../etc/passwd',
      '/../../../etc/passwd',
      '....//....//....//etc/passwd',
      '/etc/passwd',
      '..%2f..%2f..%2fetc/passwd',  // URL encoded (won't work but let's test)
    ];

    attackVectors.forEach(vector => {
      const safePath = createSafePath(root, vector);
      // All should result in a path within /explore
      // None should allow accessing /etc/passwd
      expect(safePath).not.toBe('/etc/passwd');
      expect(safePath).not.toBeNull(); // Should be within root
      if (safePath) {
        expect(isPathWithinRoot(safePath, root)).toBe(true);
      }
    });
  });

  it('should prevent null byte attacks', () => {
    const vector = '/safe\u0000../../../etc/passwd';
    const safePath = createSafePath(root, vector);
    expect(safePath).toBe('/explore/etc/passwd'); // Still within root
  });
});
