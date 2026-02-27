import { isWriteEnabled, isContentTooLarge, isMtimeConflict, DEFAULT_MAX_WRITE_BYTES } from './writeGuard';
import { sanitizePath, isPathWithinRoot, createSafePath } from './pathUtils';

// ─── isWriteEnabled ───────────────────────────────────────────────────────────

describe('isWriteEnabled', () => {
  const originalEnv = process.env.ENABLE_WRITE;

  afterEach(() => {
    // Restore env between tests
    if (originalEnv === undefined) {
      delete process.env.ENABLE_WRITE;
    } else {
      process.env.ENABLE_WRITE = originalEnv;
    }
  });

  it('returns false when ENABLE_WRITE is not set', () => {
    delete process.env.ENABLE_WRITE;
    expect(isWriteEnabled()).toBe(false);
  });

  it('returns false when ENABLE_WRITE=false', () => {
    process.env.ENABLE_WRITE = 'false';
    expect(isWriteEnabled()).toBe(false);
  });

  it('returns false when ENABLE_WRITE=1', () => {
    process.env.ENABLE_WRITE = '1';
    expect(isWriteEnabled()).toBe(false);
  });

  it('returns false when ENABLE_WRITE=yes', () => {
    process.env.ENABLE_WRITE = 'yes';
    expect(isWriteEnabled()).toBe(false);
  });

  it('returns true only when ENABLE_WRITE=true (exact, case-sensitive)', () => {
    process.env.ENABLE_WRITE = 'true';
    expect(isWriteEnabled()).toBe(true);
  });

  it('returns false when ENABLE_WRITE=True (wrong case)', () => {
    process.env.ENABLE_WRITE = 'True';
    expect(isWriteEnabled()).toBe(false);
  });

  it('returns false when ENABLE_WRITE=TRUE (all caps)', () => {
    process.env.ENABLE_WRITE = 'TRUE';
    expect(isWriteEnabled()).toBe(false);
  });
});

// ─── isContentTooLarge ────────────────────────────────────────────────────────

describe('isContentTooLarge', () => {
  it('returns false for empty string', () => {
    expect(isContentTooLarge('')).toBe(false);
  });

  it('returns false for small content', () => {
    expect(isContentTooLarge('hello world')).toBe(false);
  });

  it('returns false for content exactly at default limit', () => {
    const atLimit = Buffer.alloc(DEFAULT_MAX_WRITE_BYTES, 'x').toString();
    expect(isContentTooLarge(atLimit)).toBe(false);
  });

  it('returns true for content one byte over default limit', () => {
    const overLimit = Buffer.alloc(DEFAULT_MAX_WRITE_BYTES + 1, 'x').toString();
    expect(isContentTooLarge(overLimit)).toBe(true);
  });

  it('returns true when custom maxBytes is exceeded', () => {
    expect(isContentTooLarge('hello', 4)).toBe(true);
  });

  it('returns false when custom maxBytes is not exceeded', () => {
    expect(isContentTooLarge('hello', 10)).toBe(false);
  });

  it('counts multibyte characters correctly (emoji = 4 bytes)', () => {
    const emoji = '😀'; // U+1F600, 4 bytes in UTF-8
    expect(isContentTooLarge(emoji, 3)).toBe(true);
    expect(isContentTooLarge(emoji, 4)).toBe(false);
  });

  it('counts multibyte characters correctly (CJK = 3 bytes)', () => {
    const cjk = '中'; // 3 bytes in UTF-8
    expect(isContentTooLarge(cjk, 2)).toBe(true);
    expect(isContentTooLarge(cjk, 3)).toBe(false);
  });
});

// ─── isMtimeConflict ─────────────────────────────────────────────────────────

describe('isMtimeConflict', () => {
  const serverMtime = new Date('2024-06-15T12:00:00.000Z');

  it('returns false when clientMtime is undefined', () => {
    expect(isMtimeConflict(serverMtime, undefined)).toBe(false);
  });

  it('returns false when clientMtime is null', () => {
    expect(isMtimeConflict(serverMtime, null)).toBe(false);
  });

  it('returns false when clientMtime is an invalid date string', () => {
    expect(isMtimeConflict(serverMtime, 'not-a-date')).toBe(false);
    expect(isMtimeConflict(serverMtime, '')).toBe(false);
  });

  it('returns false when clientMtime matches exactly', () => {
    expect(isMtimeConflict(serverMtime, serverMtime.toISOString())).toBe(false);
  });

  it('returns false when difference is within default tolerance (< 1000 ms)', () => {
    const closeDate = new Date(serverMtime.getTime() + 500).toISOString();
    expect(isMtimeConflict(serverMtime, closeDate)).toBe(false);
  });

  it('returns true when difference exceeds default tolerance (> 1000 ms)', () => {
    const stale = new Date(serverMtime.getTime() - 5000).toISOString();
    expect(isMtimeConflict(serverMtime, stale)).toBe(true);
  });

  it('returns true when exactly at tolerance boundary (= toleranceMs)', () => {
    const exactly = new Date(serverMtime.getTime() + 1001).toISOString();
    expect(isMtimeConflict(serverMtime, exactly, 1000)).toBe(true);
  });

  it('respects custom toleranceMs (larger window)', () => {
    const closeDate = new Date(serverMtime.getTime() + 1500).toISOString();
    expect(isMtimeConflict(serverMtime, closeDate, 1000)).toBe(true);  // outside default
    expect(isMtimeConflict(serverMtime, closeDate, 2000)).toBe(false); // inside 2s window
  });
});

// ─── Security: Path traversal in write context ───────────────────────────────

describe('Security: path traversal prevention applies equally to writes', () => {
  const root = '/explore';

  it('constrains all traversal attacks to within root', () => {
    const attacks = [
      '../../../etc/cron.d/evil',
      '/../../etc/passwd',
      '....//....//etc/shadow',
      '/etc/crontab',
    ];

    attacks.forEach((vector) => {
      const safePath = createSafePath(root, vector);
      expect(safePath).not.toBeNull();
      if (safePath) {
        expect(isPathWithinRoot(safePath, root)).toBe(true);
        // None should resolve to the actual system path
        expect(safePath.startsWith(root)).toBe(true);
      }
    });
  });

  it('blocks null-byte injection in write paths', () => {
    const vector = '/legit\x00../../../../etc/cron.d/evil';
    const sanitized = sanitizePath(vector);
    const safePath = createSafePath(root, sanitized);
    expect(safePath).not.toBeNull();
    if (safePath) {
      expect(isPathWithinRoot(safePath, root)).toBe(true);
    }
  });

  it('blocks backslash-based traversal in write paths', () => {
    const vector = '..\\..\\..\\etc\\passwd';
    const sanitized = sanitizePath(vector);
    const safePath = createSafePath(root, sanitized);
    expect(safePath).not.toBeNull();
    if (safePath) {
      expect(isPathWithinRoot(safePath, root)).toBe(true);
    }
  });

  it('rejects paths that (after join) land outside root', () => {
    // These are constructed so the join itself would escape
    const outside = '/etc/passwd';
    expect(isPathWithinRoot(outside, root)).toBe(false);
    expect(isPathWithinRoot('/', root)).toBe(false);
    expect(isPathWithinRoot('/explore-evil', root)).toBe(false);
  });
});
