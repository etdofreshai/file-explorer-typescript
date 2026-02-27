# File Explorer TypeScript

A web-based file explorer for browsing and previewing files on a mounted volume. Built with TypeScript, featuring a secure read-only backend and responsive UI.

## Features

- 🔒 **Secure Backend**: Path traversal protection, read-only by default
- 🛡️ **Optional Token Gate**: UI access can be protected by a password/token via `UI_ACCESS_TOKEN` — validated server-side, never exposed to the client bundle
- 📁 **Directory Browsing**: Navigate folders with breadcrumb navigation
- 👁️ **File Preview**:
  - **Code / text files** — opens in read-only view by default with syntax highlighting for 28+ languages (TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, C#, Kotlin, Swift, Dart, Ruby, PHP, Bash, SQL, JSON, YAML, TOML, XML, HTML, CSS/SCSS, Markdown, and more)
  - **Markdown files** — rendered "Preview" mode (human-friendly) with a **Raw** toggle for highlighted source; defaults to rendered view
  - **Robust text detection** — extension + MIME-type fallback so code/config/log files open as text even when the server returns a generic MIME type (fixes `.ts` → `video/mp2t` misdetect)
  - Images (PNG, JPG, GIF, WebP, SVG)
  - Audio (MP3, WAV, OGG, etc.)
  - PDFs (iframe embed)
- ✏️ **Optional In-Browser Editor**: Explicit **Edit** button (shown next to Download in write mode) switches the current file into an editable textarea; Save, Cancel/back-to-view, dirty-state indicator, and conflict detection (opt-in via `ENABLE_WRITE=true`)
- 🌙 **Dark / Light Mode**: Toggle via header button; defaults to dark; preference persisted in `localStorage`
- 📱 **Responsive Design**: Two-pane layout on desktop, stacked on mobile
- ⬇️ **Downloads**: One-click file download

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server (API on :3001, UI on :3000)
npm run dev
```

Open http://localhost:3000

### Production Build

```bash
# Build both client and server
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build image
docker build -t file-explorer .

# Run with a volume mounted (read-only — default, no auth)
docker run -p 3001:3001 -v /path/to/files:/explore:ro file-explorer

# Run with token gate enabled
docker run -p 3001:3001 \
  -v /path/to/files:/explore:ro \
  -e UI_ACCESS_TOKEN=my-secret-token \
  file-explorer

# Run with both token gate and write mode
docker run -p 3001:3001 \
  -v /path/to/files:/explore:rw \
  -e UI_ACCESS_TOKEN=my-secret-token \
  -e ENABLE_WRITE=true \
  file-explorer
```

### Docker Compose

See `docker-compose.yml` for examples of both read-only and write-enabled modes.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `EXPLORE_ROOT` | `/explore` | Directory to browse |
| `UI_ACCESS_TOKEN` | *(unset)* | Optional token gate. When set, the UI shows a login modal and all `/api/browse` endpoints require the token in the `x-auth-token` header. Token is validated server-side only — never sent to the client bundle. |
| `ENABLE_WRITE` | *(unset)* | Set to `true` to enable in-browser editing. **Read the security section first.** |
| `SERVE_APP_ROOT` | *(auto)* | Static files directory (production). Defaults to `dist/client/` relative to the server binary — no manual config needed. Override only for custom/host-mounted frontends. |
| `NODE_ENV` | `development` | Environment mode |

## 🔒 Token Gate (UI_ACCESS_TOKEN)

Setting `UI_ACCESS_TOKEN` activates an optional access gate that protects both the UI and all API endpoints.

### How it works

1. **Server side**: When `UI_ACCESS_TOKEN` is set, all `/api/browse` routes require the token in the `x-auth-token` request header. Missing or incorrect tokens receive HTTP 401. The token value is **never** sent to the client bundle.

2. **Client side**: On first load, the browser checks `/api/auth-required`. If auth is required:
   - The browser checks `localStorage` for a previously validated token.
   - If a stored token exists, it is re-validated with the server via `POST /api/auth`.
   - If validation succeeds, the explorer opens without showing a modal.
   - Otherwise (no token, or token invalidated), a **login modal** is shown.
   - The entered token is sent to the server for comparison. On success it is stored in `localStorage` as `file-explorer-auth-token` so subsequent page loads skip the prompt.
   - All subsequent API calls include the token in the `x-auth-token` header.

3. **Logout / Lock**: A 🔒 lock button appears in the header when auth is active. Clicking it clears the stored token from `localStorage` and re-shows the login modal.

### Setup

```bash
# Set the token in your shell / .env / Docker env
UI_ACCESS_TOKEN=my-long-random-secret-token

# Generate a strong token (example)
openssl rand -hex 32
```

### Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth-required` | Returns `{ required: true/false }`. No token needed. |
| `POST` | `/api/auth` | Body: `{ token }`. Returns `{ ok: true }` or HTTP 401. |

### Security notes

| Property | Details |
|----------|---------|
| **Server-side validation** | Token comparison uses `crypto.timingSafeEqual` to prevent timing-based inference attacks. |
| **No client exposure** | `UI_ACCESS_TOKEN` is read from `process.env` only. It is never injected into the JS bundle or sent in any API response. |
| **API protection** | All `/api/browse` routes return HTTP 401 when auth is active and the token is missing or wrong — the frontend modal is not the only gate. |
| **localStorage persistence** | The token the *user enters* (not the server token) is stored in `localStorage` for session continuity. Clearing browser data / using incognito removes it. |
| **No session tokens / JWT** | Lightweight by design. The entered token IS the credential — no server-side session state. |
| **Fail-open on server error** | If `/api/auth-required` is unreachable, the client skips auth so the app remains usable during server restarts. Adjust this in `main.ts` if you prefer fail-closed. |
| **Not a full auth system** | This gate protects casual access; it is not a substitute for TLS, network-level access controls, or a proper identity provider for sensitive data. |

## Interaction Model

### Viewing Files

All text and code files open in **read-only view mode** first:

- **Code files** — syntax-highlighted source, scrollable, no editing risk
- **Markdown files** — rendered "Preview" (human-friendly HTML) by default
  - Click **Raw** in the action bar to see the highlighted Markdown source
  - Click **Preview** to switch back to the rendered view

### Write Mode (In-Browser Editor)

By default the app is **read-only**. The write endpoint (`PUT /api/browse/file`) returns HTTP 403 unless `ENABLE_WRITE=true` is set in the environment.

When write mode is enabled, an **Edit** button appears next to Download for all text/code files. Clicking it:

1. Switches the file into an editable `<textarea>`
2. Shows a **Save** button (disabled until changes are made) and a **Cancel** button
3. A `●` indicator appears in the title when there are unsaved changes
4. **Cancel** — prompts to confirm if there are unsaved changes, then returns to read-only view
5. **Save** — writes changes to disk; on success, the dirty indicator clears and a "✓ Saved" message appears; the textarea remains open so you can keep editing
6. On save, the client sends the file's `Last-Modified` timestamp; the server rejects the write with **HTTP 409 Conflict** if the file was modified on disk since the client loaded it

Non-text files (images, audio, PDFs) are still read-only and display the same previews as before.

### Security Implications of `ENABLE_WRITE=true`

⚠️ **Read carefully before enabling write mode.**

| Risk | Details |
|------|---------|
| **Unauthenticated writes** | Without `UI_ACCESS_TOKEN`, any HTTP client that can reach the server can overwrite files. Use `UI_ACCESS_TOKEN` or a reverse-proxy auth layer. |
| **Data loss** | A bug or malicious request could corrupt files. Keep backups. |
| **Scope** | Writes are constrained to `EXPLORE_ROOT` via the same path-traversal protections used for reads. Files outside that directory cannot be reached. |
| **File size** | Writes larger than 5 MB are rejected (HTTP 413). |
| **Conflict safety** | The server performs an mtime check and rejects stale writes (HTTP 409), but this is not a substitute for proper version control. |

**Recommendations when enabling write mode:**
1. Set `UI_ACCESS_TOKEN` so that only authenticated users can reach the write endpoint.
2. Or run behind a reverse proxy with authentication (e.g., HTTP Basic Auth or OAuth).
3. Mount only the specific directory that needs to be editable, not your entire filesystem.
4. Use a `rw` Docker volume only for `EXPLORE_ROOT`; keep other mounts read-only.
5. Do not expose the port directly to the internet.

## Architecture

```
file-explorer-typescript/
├── src/
│   ├── server/                 # Express backend
│   │   ├── index.ts           # Server entry point (auth endpoints + middleware)
│   │   ├── routes/
│   │   │   └── browse.ts      # File browsing + write API
│   │   ├── middleware/
│   │   │   └── errorHandler.ts
│   │   └── utils/
│   │       ├── authGuard.ts   # Auth gate helpers (isAuthRequired, isValidToken)
│   │       ├── pathUtils.ts   # Path sanitization & root-boundary checks
│   │       └── writeGuard.ts  # Write-mode guard & validation helpers
│   │
│   └── client/                 # Vite frontend
│       ├── main.ts            # Entry point + auth gate logic
│       ├── auth.ts            # Auth state helpers + authFetch wrapper
│       ├── FileExplorer.ts    # Main app class (includes text editor)
│       └── styles.css         # All styles (including auth modal + editor styles)
│
├── public/                     # Static assets
├── dist/                       # Build output
│   ├── server/                # Compiled backend
│   └── client/                # Compiled frontend
│
├── index.html                 # App shell (includes auth modal markup)
├── vite.config.ts             # Frontend build config
├── tsconfig.json              # Frontend TypeScript config
├── tsconfig.server.json       # Backend TypeScript config
└── package.json
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `highlight.js` | Syntax highlighting for 28+ languages |
| `marked` | Markdown → HTML rendering for `.md` / `.markdown` / `.mdx` files |

### API Endpoints

| Method | Path | Auth required | Description |
|--------|------|:---:|-------------|
| `GET` | `/api/health` | No | Health check — includes `writeEnabled` flag |
| `GET` | `/api/auth-required` | No | Returns `{ required: bool }` — never exposes the token |
| `POST` | `/api/auth` | No | Validates `{ token }` body; returns `{ ok: bool }` |
| `GET` | `/api/browse?path=/` | When set | List directory contents |
| `GET` | `/api/browse/file?path=/file.txt` | When set | Download/preview file |
| `HEAD` | `/api/browse/file?path=/file.txt` | When set | Get file metadata |
| `PUT` | `/api/browse/file?path=/file.txt` | When set | Write file (requires `ENABLE_WRITE=true`) |

"Auth required" means the `x-auth-token` header must carry the correct value when `UI_ACCESS_TOKEN` is configured.

#### PUT /api/browse/file — Request body (JSON)

```json
{
  "content": "new file content as a string",
  "mtime": "2024-06-15T12:00:00.000Z"
}
```

The `mtime` field is optional. When supplied it is compared against the server's
current `mtime` for the file; if they differ by more than 1 second the request
is rejected with HTTP 409 so the client can alert the user before overwriting.

#### PUT /api/browse/file — Response codes

| Code | Meaning |
|------|---------|
| 200 | Write succeeded; body includes `{ success, mtime, size }` |
| 400 | Bad request (missing content, target is a directory, etc.) |
| 401 | Auth required but token missing or wrong |
| 403 | Write mode disabled, or path traversal detected |
| 404 | File not found (only existing files can be written) |
| 409 | Conflict — file was modified on disk since client loaded it |
| 413 | Content exceeds 5 MB limit |

### Security

The backend implements multiple layers of path traversal protection for both reads **and** writes:

1. **Input Sanitization** (`pathUtils.sanitizePath`): Removes null bytes, normalizes slashes, resolves `.` / `..` within a virtual root
2. **Root Boundary Check** (`pathUtils.isPathWithinRoot`): Ensures the resolved absolute path starts with `EXPLORE_ROOT`
3. **Auth Guard** (`authGuard.isAuthRequired` / `authGuard.isValidToken`): When `UI_ACCESS_TOKEN` is set, all browse routes require `x-auth-token`; token comparison uses `timingSafeEqual`
4. **Write Guard** (`writeGuard.isWriteEnabled`): Requires `ENABLE_WRITE=true` (exact string match, case-sensitive)
5. **Size Guard** (`writeGuard.isContentTooLarge`): Rejects payloads > 5 MB
6. **Conflict Guard** (`writeGuard.isMtimeConflict`): Rejects stale writes based on mtime

See `src/server/utils/` for implementation details.

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

Tests cover:
- Path sanitization and traversal prevention (`pathUtils.test.ts`)
- Write guard logic — enabled/disabled detection, size limits, mtime conflict (`writeGuard.test.ts`)
- Auth guard logic — required/not-required, valid/invalid tokens, security properties (`authGuard.test.ts`)
- Security attack scenarios (path traversal attempts against both read and write paths)

## Future Enhancements

- [ ] File search within directory tree
- [ ] File sorting (name, size, date)
- [ ] Tree view sidebar option
- [ ] Keyboard navigation
- [ ] File type icons for more formats
- [ ] Video preview support
- [ ] Archive (ZIP, TAR) preview
- [x] Syntax highlighting for code files
- [x] Dark mode
- [x] In-browser file editor with write mode
- [x] Markdown rendered preview (Preview / Raw toggle)
- [x] View-first UX: read-only by default, explicit Edit button in write mode
- [x] Optional token gate (`UI_ACCESS_TOKEN`) with server-side validation
- [ ] Internationalization (i18n)
- [ ] File/folder bookmarking
- [ ] Thumbnail generation for images
- [ ] Pagination for large directories
- [ ] WebSocket for real-time file changes

## License

MIT
