# File Explorer TypeScript

A web-based file explorer for browsing and previewing files on a mounted volume. Built with TypeScript, featuring a secure read-only backend and responsive UI.

## Features

- 🔒 **Secure Backend**: Path traversal protection, read-only access
- 📁 **Directory Browsing**: Navigate folders with breadcrumb navigation
- 👁️ **File Preview**: 
  - Text files (code, logs, configs)
  - Images (PNG, JPG, GIF, WebP, SVG)
  - Audio (MP3, WAV, OGG, etc.)
  - PDFs (iframe embed)
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

# Run with a volume mounted
docker run -p 3001:3001 -v /path/to/files:/explore:ro file-explorer
```

### Docker Compose

Edit `docker-compose.yml` to set your volume path:

```yaml
volumes:
  - /path/to/your/files:/explore:ro
```

Then run:

```bash
docker compose up -d
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `EXPLORE_ROOT` | `/explore` | Directory to browse |
| `SERVE_APP_ROOT` | *(auto)* | Static files directory (production). Defaults to `dist/client/` relative to the server binary — no manual config needed. Override only for custom/host-mounted frontends. |
| `NODE_ENV` | `development` | Environment mode |

## Architecture

```
file-explorer-typescript/
├── src/
│   ├── server/                 # Express backend
│   │   ├── index.ts           # Server entry point
│   │   ├── routes/
│   │   │   └── browse.ts      # File browsing API
│   │   ├── middleware/
│   │   │   └── errorHandler.ts
│   │   └── utils/
│   │       └── pathUtils.ts   # Security utilities
│   │
│   └── client/                 # Vite frontend
│       ├── main.ts            # Entry point
│       ├── FileExplorer.ts    # Main app class
│       └── styles.css         # All styles
│
├── public/                     # Static assets
├── dist/                       # Build output
│   ├── server/                # Compiled backend
│   └── client/                # Compiled frontend
│
├── index.html                 # App shell
├── vite.config.ts             # Frontend build config
├── tsconfig.json              # Frontend TypeScript config
├── tsconfig.server.json       # Backend TypeScript config
└── package.json
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/browse?path=/` | List directory contents |
| `GET` | `/api/browse/file?path=/file.txt` | Download/preview file |
| `HEAD` | `/api/browse/file?path=/file.txt` | Get file metadata |

### Security

The backend implements multiple layers of path traversal protection:

1. **Input Sanitization**: Removes null bytes, normalizes slashes
2. **Path Normalization**: Resolves `.` and `..` segments
3. **Root Boundary Check**: Ensures resolved path stays within `EXPLORE_ROOT`
4. **Read-Only Access**: No write, delete, or modify operations

See `src/server/utils/pathUtils.ts` for implementation details.

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

Tests focus on critical security logic (path traversal prevention).

## Future Enhancements

- [ ] File search within directory tree
- [ ] File sorting (name, size, date)
- [ ] Tree view sidebar option
- [ ] Keyboard navigation
- [ ] File type icons for more formats
- [ ] Video preview support
- [ ] Archive (ZIP, TAR) preview
- [ ] Syntax highlighting for code files
- [x] Dark mode
- [ ] Internationalization (i18n)
- [ ] File/folder bookmarking
- [ ] Thumbnail generation for images
- [ ] Pagination for large directories
- [ ] WebSocket for real-time file changes
- [ ] Optional authentication layer

## License

MIT
