import { isAuthRequired, isValidToken } from './authGuard';

// ─── isAuthRequired ──────────────────────────────────────────────────────────

describe('isAuthRequired', () => {
  const originalEnv = process.env.UI_ACCESS_TOKEN;

  afterEach(() => {
    // Restore env between tests
    if (originalEnv === undefined) {
      delete process.env.UI_ACCESS_TOKEN;
    } else {
      process.env.UI_ACCESS_TOKEN = originalEnv;
    }
  });

  it('returns false when UI_ACCESS_TOKEN is not set', () => {
    delete process.env.UI_ACCESS_TOKEN;
    expect(isAuthRequired()).toBe(false);
  });

  it('returns false when UI_ACCESS_TOKEN is an empty string', () => {
    process.env.UI_ACCESS_TOKEN = '';
    expect(isAuthRequired()).toBe(false);
  });

  it('returns true when UI_ACCESS_TOKEN is a non-empty string', () => {
    process.env.UI_ACCESS_TOKEN = 'supersecret';
    expect(isAuthRequired()).toBe(true);
  });

  it('returns true for whitespace-only tokens (no trimming — user set it)', () => {
    process.env.UI_ACCESS_TOKEN = '   ';
    expect(isAuthRequired()).toBe(true);
  });

  it('returns true for long random tokens', () => {
    process.env.UI_ACCESS_TOKEN = 'a'.repeat(128);
    expect(isAuthRequired()).toBe(true);
  });
});

// ─── isValidToken ─────────────────────────────────────────────────────────────

describe('isValidToken', () => {
  const originalEnv = process.env.UI_ACCESS_TOKEN;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.UI_ACCESS_TOKEN;
    } else {
      process.env.UI_ACCESS_TOKEN = originalEnv;
    }
  });

  // ── Auth disabled ──────────────────────────────────────────────────────────

  it('returns true for any token when auth is disabled (env not set)', () => {
    delete process.env.UI_ACCESS_TOKEN;
    expect(isValidToken('anything')).toBe(true);
    expect(isValidToken('')).toBe(true);
    expect(isValidToken(null)).toBe(true);
    expect(isValidToken(undefined)).toBe(true);
  });

  it('returns true for any token when auth is disabled (env empty)', () => {
    process.env.UI_ACCESS_TOKEN = '';
    expect(isValidToken('something')).toBe(true);
    expect(isValidToken(null)).toBe(true);
  });

  // ── Auth enabled ───────────────────────────────────────────────────────────

  it('returns true when the token matches exactly', () => {
    process.env.UI_ACCESS_TOKEN = 'correct-token-123';
    expect(isValidToken('correct-token-123')).toBe(true);
  });

  it('returns false when the token is wrong', () => {
    process.env.UI_ACCESS_TOKEN = 'correct-token-123';
    expect(isValidToken('wrong-token')).toBe(false);
  });

  it('returns false when the token is null', () => {
    process.env.UI_ACCESS_TOKEN = 'correct-token-123';
    expect(isValidToken(null)).toBe(false);
  });

  it('returns false when the token is undefined', () => {
    process.env.UI_ACCESS_TOKEN = 'correct-token-123';
    expect(isValidToken(undefined)).toBe(false);
  });

  it('returns false when the token is an empty string', () => {
    process.env.UI_ACCESS_TOKEN = 'correct-token-123';
    expect(isValidToken('')).toBe(false);
  });

  it('is case-sensitive (wrong case → reject)', () => {
    process.env.UI_ACCESS_TOKEN = 'MySecret';
    expect(isValidToken('mysecret')).toBe(false);
    expect(isValidToken('MYSECRET')).toBe(false);
    expect(isValidToken('MySecret')).toBe(true);
  });

  it('rejects tokens that are only partially correct', () => {
    process.env.UI_ACCESS_TOKEN = 'correct-token-123';
    expect(isValidToken('correct')).toBe(false);
    expect(isValidToken('correct-token-123!')).toBe(false);
    expect(isValidToken(' correct-token-123')).toBe(false);
  });

  it('handles unicode characters correctly', () => {
    process.env.UI_ACCESS_TOKEN = 'パスワード🔑';
    expect(isValidToken('パスワード🔑')).toBe(true);
    expect(isValidToken('パスワード')).toBe(false);
  });

  it('handles very long tokens', () => {
    const long = 'x'.repeat(512);
    process.env.UI_ACCESS_TOKEN = long;
    expect(isValidToken(long)).toBe(true);
    expect(isValidToken(long + 'x')).toBe(false);
    expect(isValidToken(long.slice(0, -1))).toBe(false);
  });
});

// ─── Security: token never exposed ───────────────────────────────────────────

describe('Security properties', () => {
  it('isValidToken does not return the configured token in any error path', () => {
    process.env.UI_ACCESS_TOKEN = 'super-secret';
    // Even a wrong token gives no information about the real one
    const result = isValidToken('wrong');
    expect(result).toBe(false);
    // Verify the return type is boolean only
    expect(typeof result).toBe('boolean');
  });

  it('isAuthRequired does not expose the token value', () => {
    process.env.UI_ACCESS_TOKEN = 'super-secret';
    const result = isAuthRequired();
    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
    // result is only a boolean — no token data
  });
});
