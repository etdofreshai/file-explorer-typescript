import { showError } from './main.js';
import { isTextByExtension, getLanguageName, isMarkdownExt } from './codeDetect.js';
import { authFetch } from './auth.js';

// ---------------------------------------------------------------------------
// highlight.js — import core + the languages we want to bundle
// ---------------------------------------------------------------------------
import hljs from 'highlight.js/lib/core';
import langBash from 'highlight.js/lib/languages/bash';
import langC from 'highlight.js/lib/languages/c';
import langCpp from 'highlight.js/lib/languages/cpp';
import langCsharp from 'highlight.js/lib/languages/csharp';
import langCss from 'highlight.js/lib/languages/css';
import langDiff from 'highlight.js/lib/languages/diff';
import langDockerfile from 'highlight.js/lib/languages/dockerfile';
import langGo from 'highlight.js/lib/languages/go';
import langGraphql from 'highlight.js/lib/languages/graphql';
import langIni from 'highlight.js/lib/languages/ini';
import langJava from 'highlight.js/lib/languages/java';
import langJavascript from 'highlight.js/lib/languages/javascript';
import langJson from 'highlight.js/lib/languages/json';
import langKotlin from 'highlight.js/lib/languages/kotlin';
import langLua from 'highlight.js/lib/languages/lua';
import langMarkdown from 'highlight.js/lib/languages/markdown';
import langPhp from 'highlight.js/lib/languages/php';
import langPowershell from 'highlight.js/lib/languages/powershell';
import langPython from 'highlight.js/lib/languages/python';
import langR from 'highlight.js/lib/languages/r';
import langRuby from 'highlight.js/lib/languages/ruby';
import langRust from 'highlight.js/lib/languages/rust';
import langScss from 'highlight.js/lib/languages/scss';
import langShell from 'highlight.js/lib/languages/shell';
import langSql from 'highlight.js/lib/languages/sql';
import langSwift from 'highlight.js/lib/languages/swift';
import langTypescript from 'highlight.js/lib/languages/typescript';
import langXml from 'highlight.js/lib/languages/xml'; // also covers HTML, Vue, Svelte
import langYaml from 'highlight.js/lib/languages/yaml';

// ---------------------------------------------------------------------------
// marked — Markdown renderer
// ---------------------------------------------------------------------------
import { marked } from 'marked';

// Configure marked with safe defaults
marked.setOptions({ async: false });

hljs.registerLanguage('bash', langBash);
hljs.registerLanguage('c', langC);
hljs.registerLanguage('cpp', langCpp);
hljs.registerLanguage('csharp', langCsharp);
hljs.registerLanguage('css', langCss);
hljs.registerLanguage('diff', langDiff);
hljs.registerLanguage('dockerfile', langDockerfile);
hljs.registerLanguage('go', langGo);
hljs.registerLanguage('graphql', langGraphql);
hljs.registerLanguage('ini', langIni);
hljs.registerLanguage('java', langJava);
hljs.registerLanguage('javascript', langJavascript);
hljs.registerLanguage('json', langJson);
hljs.registerLanguage('kotlin', langKotlin);
hljs.registerLanguage('lua', langLua);
hljs.registerLanguage('markdown', langMarkdown);
hljs.registerLanguage('php', langPhp);
hljs.registerLanguage('powershell', langPowershell);
hljs.registerLanguage('python', langPython);
hljs.registerLanguage('r', langR);
hljs.registerLanguage('ruby', langRuby);
hljs.registerLanguage('rust', langRust);
hljs.registerLanguage('scss', langScss);
hljs.registerLanguage('shell', langShell);
hljs.registerLanguage('sql', langSql);
hljs.registerLanguage('swift', langSwift);
hljs.registerLanguage('typescript', langTypescript);
hljs.registerLanguage('xml', langXml);
hljs.registerLanguage('yaml', langYaml);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number | null;
  modified: string;
  mimeType: string | null;
  isPreviewable: boolean;
}

interface DirectoryListing {
  path: string;
  parent: string | null;
  items: FileItem[];
}

interface HealthResponse {
  status: string;
  exploreRoot: string;
  writeEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maximum file size (bytes) for which syntax highlighting is applied.
 * Files larger than this are displayed as plain text to avoid UI sluggishness.
 */
const HIGHLIGHT_SIZE_LIMIT = 500 * 1024; // 500 KB

/**
 * Returns true when a file should be opened as text/code (preview + optional
 * edit), combining the server-supplied MIME type with extension fallback.
 */
function isTextFile(item: FileItem): boolean {
  const mime = item.mimeType ?? '';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'application/ecmascript' ||
    mime === 'application/x-sh' ||
    mime === 'application/xml' ||
    mime === 'application/sql'
  ) {
    return true;
  }
  // Extension fallback for files where the server returned a generic MIME type
  return isTextByExtension(item.name);
}

// ---------------------------------------------------------------------------
// FileExplorer class
// ---------------------------------------------------------------------------

export class FileExplorer {
  private currentPath = '/';
  private fileCache = new Map<string, DirectoryListing>();

  // Write mode: determined by /api/health on init
  private writeEnabled = false;

  // ── Current text-file state ────────────────────────────────────────────────
  /** Absolute virtual path of the currently-open text file. */
  private editorFilePath: string | null = null;
  /** Original content fetched from the server (also used as "saved" baseline). */
  private editorOriginalContent: string | null = null;
  /** Last-Modified header value (ISO string) from the server, for conflict detection. */
  private editorMtime: string | null = null;

  // ── View / edit mode ───────────────────────────────────────────────────────
  /** Whether the text pane is in view (read-only) or edit (textarea) mode. */
  private fileViewMode: 'view' | 'edit' = 'view';
  /** True when the currently open file has a Markdown extension. */
  private currentIsMarkdown = false;
  /** For markdown view mode: rendered 'preview' or 'raw' highlighted source. */
  private mdDisplayMode: 'preview' | 'raw' = 'preview';
  /** Cached FileItem for the currently-open text file (used during re-renders). */
  private currentItem: FileItem | null = null;
  /** highlight.js language identifier for the current file. */
  private currentLanguage: string | undefined = undefined;

  /** When true, navigate()/selectFile() skip updating the URL hash (used while reacting to a hashchange). */
  private suppressHashUpdate = false;

  constructor() {
    this.init();
  }

  private async init() {
    this.showLoading(true);
    try {
      await this.fetchHealth();
      window.addEventListener('hashchange', () => this.handleHashChange());
      await this.applyHashRoute();
    } catch (error) {
      console.error('Failed to initialize:', error);
      showError('Failed to load file explorer');
    } finally {
      this.showLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Hash-based routing
  //   #path=/foo/bar           → navigate to folder /foo/bar
  //   #path=/foo&file=baz.txt  → navigate to /foo and select baz.txt
  // ---------------------------------------------------------------------------

  private parseHash(): { path: string; file: string | null } {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return { path: '/', file: null };
    const params = new URLSearchParams(raw);
    const path = params.get('path') || '/';
    const file = params.get('file');
    return { path, file };
  }

  private updateHash(path: string, file: string | null) {
    const params = new URLSearchParams();
    params.set('path', path);
    if (file) params.set('file', file);
    const next = '#' + params.toString();
    if (window.location.hash !== next) {
      this.suppressHashUpdate = true;
      window.history.replaceState(null, '', next);
      this.suppressHashUpdate = false;
    }
  }

  private async applyHashRoute() {
    const { path, file } = this.parseHash();
    await this.navigate(path, { fromHash: true });
    if (file) {
      // Use fetchDirectory (cached) rather than reading by key — currentPath
      // may have been normalized by the server and not match the cache key.
      const listing = await this.fetchDirectory(this.currentPath);
      const item = listing.items.find(i => i.name === file && i.type === 'file');
      if (item) {
        this.suppressHashUpdate = true;
        await this.selectFile(item);
        this.suppressHashUpdate = false;
      }
    }
  }

  private handleHashChange() {
    if (this.suppressHashUpdate) return;
    void this.applyHashRoute();
  }

  /**
   * Reload the current directory from the server (bypassing cache) and, if a
   * file is currently open in the preview, re-fetch its content too — without
   * closing the preview or losing the user's view/edit mode.
   */
  private async refresh() {
    const btn = document.getElementById('refresh-btn');
    btn?.classList.add('spinning');

    const openFilePath = this.editorFilePath;
    const openItem = this.currentItem;
    const wasEditing = this.fileViewMode === 'edit';

    try {
      this.fileCache.delete(this.currentPath);
      const listing = await this.fetchDirectory(this.currentPath);
      this.currentPath = listing.path;
      this.renderBreadcrumb();
      this.renderFileList(listing);

      // Restore selection highlight if the open file is still in the listing
      if (openItem) {
        const sel = document.querySelector(`.file-item[data-name="${openItem.name}"]`);
        sel?.classList.add('selected');
      }

      // Re-fetch the open file's content, preserving view/edit mode
      if (openFilePath && openItem && !wasEditing) {
        await this.showTextPreview(openFilePath, openItem);
      } else if (openFilePath && openItem && wasEditing) {
        // In edit mode: don't clobber the user's in-progress edits.
        // Just refresh the mtime baseline silently so the next save still works.
      }
    } finally {
      document.getElementById('refresh-btn')?.classList.remove('spinning');
    }
  }

  private closeSidebarIfMobile() {
    if (window.matchMedia('(max-width: 768px)').matches) {
      document.body.classList.remove('sidebar-open');
      document.getElementById('sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    }
  }

  private async fetchHealth() {
    try {
      const res = await authFetch('/api/health');
      if (res.ok) {
        const data: HealthResponse = await res.json();
        this.writeEnabled = data.writeEnabled === true;
      }
    } catch {
      this.writeEnabled = false;
    }
  }

  private async navigate(path: string, opts: { fromHash?: boolean } = {}) {
    this.showLoading(true);
    try {
      const listing = await this.fetchDirectory(path);
      this.currentPath = listing.path;

      this.renderBreadcrumb();
      this.renderFileList(listing);
      this.clearPreview();
      if (!opts.fromHash) this.updateHash(this.currentPath, null);
    } catch (error) {
      console.error('Navigation error:', error);
      showError(`Failed to navigate: ${(error as Error).message}`);
    } finally {
      this.showLoading(false);
    }
  }

  private async fetchDirectory(path: string): Promise<DirectoryListing> {
    if (this.fileCache.has(path)) {
      return this.fileCache.get(path)!;
    }

    const response = await authFetch(`/api/browse?path=${encodeURIComponent(path)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to load directory');
    }

    const listing = await response.json();
    this.fileCache.set(path, listing);
    return listing;
  }

  private renderBreadcrumb() {
    const container = document.getElementById('breadcrumb');
    if (!container) return;

    container.innerHTML = '';

    const rootBtn = this.createBreadcrumbItem('Root', '/', true);
    container.appendChild(rootBtn);

    if (this.currentPath === '/') return;

    const segments = this.currentPath.split('/').filter(Boolean);
    let builtPath = '';

    segments.forEach((segment, index) => {
      builtPath += '/' + segment;
      const isLast = index === segments.length - 1;

      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = '/';
      container.appendChild(separator);

      const item = this.createBreadcrumbItem(segment, builtPath, isLast);
      container.appendChild(item);
    });

    container.scrollLeft = container.scrollWidth;
  }

  private createBreadcrumbItem(label: string, path: string, isActive: boolean): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `breadcrumb-item${isActive ? ' active' : ''}`;
    btn.textContent = label;
    btn.addEventListener('click', () => this.navigate(path));
    return btn;
  }

  private renderFileList(listing: DirectoryListing) {
    const container = document.getElementById('file-list');
    if (!container) return;

    container.innerHTML = '';

    // Top row: optional ".." parent link + Refresh button on the right
    const topRow = document.createElement('div');
    topRow.className = 'file-row-top';

    if (listing.parent !== null) {
      const parentItem = this.createFileItem({
        name: '..',
        type: 'directory',
        size: null,
        modified: '',
        mimeType: null,
        isPreviewable: false,
      }, true);
      parentItem.addEventListener('click', () => this.navigate(listing.parent!));
      topRow.appendChild(parentItem);
    } else {
      topRow.classList.add('no-parent');
    }

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'refresh-btn';
    refreshBtn.id = 'refresh-btn';
    refreshBtn.setAttribute('aria-label', 'Refresh file list');
    refreshBtn.setAttribute('title', 'Refresh');
    refreshBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    `;
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.refresh();
    });
    topRow.appendChild(refreshBtn);

    container.appendChild(topRow);

    if (listing.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <p>Empty directory</p>
      `;
      container.appendChild(empty);
      return;
    }

    listing.items.forEach(item => {
      const element = this.createFileItem(item);

      if (item.type === 'directory') {
        element.addEventListener('click', () => {
          const newPath = this.currentPath === '/'
            ? `/${item.name}`
            : `${this.currentPath}/${item.name}`;
          this.navigate(newPath);
        });
      } else {
        element.addEventListener('click', () => this.selectFile(item));
      }

      container.appendChild(element);
    });
  }

  private createFileItem(item: FileItem, isParent = false): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'file-item';
    btn.setAttribute('data-name', isParent ? '..' : item.name);

    const icon = this.getFileIcon(item, isParent);
    const meta = item.size !== null ? this.formatSize(item.size) : '';

    btn.innerHTML = `
      <svg class="file-icon ${icon.class}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${icon.path}
      </svg>
      <div class="file-info">
        <div class="file-name">${isParent ? '..' : this.escapeHtml(item.name)}</div>
        ${meta ? `<div class="file-meta">${meta}</div>` : ''}
      </div>
    `;

    return btn;
  }

  private getFileIcon(item: FileItem, isParent: boolean): { class: string; path: string } {
    if (isParent || item.type === 'directory') {
      return {
        class: 'folder',
        path: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      };
    }

    const mime = item.mimeType ?? '';

    if (mime.startsWith('image/')) {
      return {
        class: 'image',
        path: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
      };
    }

    if (mime.startsWith('audio/')) {
      return {
        class: 'audio',
        path: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      };
    }

    // Text / code icon — shown for any text-like file
    if (isTextFile(item)) {
      return {
        class: 'text',
        path: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
      };
    }

    return {
      class: 'file',
      path: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    };
  }

  private async selectFile(item: FileItem) {
    document.querySelectorAll('.file-item.selected').forEach(el => {
      el.classList.remove('selected');
    });

    const selectedItem = document.querySelector(`.file-item[data-name="${item.name}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
    }

    this.clearPreview();

    const container = document.getElementById('preview-content');
    if (!container) return;

    const filePath = this.currentPath === '/'
      ? `/${item.name}`
      : `${this.currentPath}/${item.name}`;

    if (!this.suppressHashUpdate) this.updateHash(this.currentPath, item.name);
    this.closeSidebarIfMobile();

    // Prefer explicit server MIME previewable flag, but also accept files that
    // pass our extension-based text detection even if the server flagged them
    // as non-previewable (e.g. unknown extension returned as octet-stream).
    const textFile = isTextFile(item);

    if (item.mimeType?.startsWith('image/')) {
      this.showImagePreview(filePath, item);
    } else if (item.mimeType?.startsWith('audio/')) {
      this.showAudioPreview(filePath, item);
    } else if (item.mimeType === 'application/pdf') {
      this.showPdfPreview(filePath, item);
    } else if (textFile) {
      await this.showTextPreview(filePath, item);
    } else if (item.isPreviewable) {
      // Remaining server-flagged previewable types (e.g. SVG served as image/svg+xml)
      if (item.mimeType?.startsWith('image/')) {
        this.showImagePreview(filePath, item);
      } else {
        await this.showTextPreview(filePath, item);
      }
    } else {
      this.showDownloadPreview(item);
    }
  }

  private showImagePreview(filePath: string, item: FileItem) {
    const container = document.getElementById('preview-content');
    if (!container) return;

    container.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <svg class="file-icon image" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          ${this.escapeHtml(item.name)}
        </div>
        <div class="preview-actions">
          <a class="btn btn-primary" href="/api/browse/file?path=${encodeURIComponent(filePath)}" download="${this.escapeHtml(item.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </a>
        </div>
      </div>
      <div class="image-preview">
        <img src="/api/browse/file?path=${encodeURIComponent(filePath)}" alt="${this.escapeHtml(item.name)}">
      </div>
    `;
  }

  private showAudioPreview(filePath: string, item: FileItem) {
    const container = document.getElementById('preview-content');
    if (!container) return;

    container.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <svg class="file-icon audio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          ${this.escapeHtml(item.name)}
        </div>
        <div class="preview-actions">
          <a class="btn btn-primary" href="/api/browse/file?path=${encodeURIComponent(filePath)}" download="${this.escapeHtml(item.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </a>
        </div>
      </div>
      <div class="audio-preview">
        <audio controls preload="metadata">
          <source src="/api/browse/file?path=${encodeURIComponent(filePath)}" type="${item.mimeType}">
          Your browser does not support the audio element.
        </audio>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Text / Code / Markdown preview — VIEW + EDIT mode
  // ---------------------------------------------------------------------------

  /**
   * Main entry point for all text-file previews.
   * 1. Resets mode state and shows a loading skeleton.
   * 2. Fetches the file content.
   * 3. Delegates to renderTextPreviewUI() which handles all mode combinations.
   */
  private async showTextPreview(filePath: string, item: FileItem) {
    const container = document.getElementById('preview-content');
    if (!container) return;

    // ── Reset state ────────────────────────────────────────────────────────
    this.editorFilePath = filePath;
    this.editorOriginalContent = null;
    this.editorMtime = null;
    this.fileViewMode = 'view';
    this.currentIsMarkdown = isMarkdownExt(item.name);
    this.mdDisplayMode = 'preview'; // default: rendered markdown
    this.currentItem = item;
    this.currentLanguage = getLanguageName(item.name);

    // ── Loading skeleton ───────────────────────────────────────────────────
    container.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <svg class="file-icon text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          ${this.escapeHtml(item.name)}
        </div>
        <div class="preview-actions"></div>
      </div>
      <div class="code-preview"><pre><code>Loading…</code></pre></div>
    `;

    // ── Fetch content ──────────────────────────────────────────────────────
    try {
      const response = await authFetch(`/api/browse/file?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Failed to load file');

      const lastModified = response.headers.get('Last-Modified');
      if (lastModified) {
        this.editorMtime = new Date(lastModified).toISOString();
      }

      const text = await response.text();
      this.editorOriginalContent = text;

      // ── Render full UI now that we have content ──────────────────────────
      this.renderTextPreviewUI();
    } catch (error) {
      container.innerHTML = `
        <div class="preview-placeholder">
          <p>Error loading file: ${this.escapeHtml((error as Error).message)}</p>
        </div>
      `;
    }
  }

  /**
   * (Re-)renders the entire text preview pane based on current state:
   *  - fileViewMode ('view' | 'edit')
   *  - mdDisplayMode ('preview' | 'raw')  — only relevant for Markdown in view mode
   *  - writeEnabled                       — controls Edit button visibility
   *
   * Safe to call multiple times; completely replaces the DOM inside preview-content.
   */
  private renderTextPreviewUI() {
    const container = document.getElementById('preview-content');
    if (!container || !this.currentItem || this.editorOriginalContent === null) return;

    const item = this.currentItem;
    const filePath = this.editorFilePath!;
    const text = this.editorOriginalContent;
    const language = this.currentLanguage;
    const isMarkdown = this.currentIsMarkdown;
    const mode = this.fileViewMode;
    const mdMode = this.mdDisplayMode;
    const isEditable = this.writeEnabled;

    // ── Build action bar ───────────────────────────────────────────────────
    const langBadge = language
      ? `<span class="lang-badge">${this.escapeHtml(language)}</span>`
      : '';

    let actionsHtml = '';

    if (mode === 'view') {
      // Markdown Raw / Preview toggle
      if (isMarkdown) {
        actionsHtml += `
          <div class="mode-toggle-group" role="group" aria-label="Markdown display mode">
            <button id="md-preview-btn"
              class="mode-toggle-btn${mdMode === 'preview' ? ' active' : ''}"
              aria-pressed="${mdMode === 'preview'}"
              title="Rendered markdown">Preview</button>
            <button id="md-raw-btn"
              class="mode-toggle-btn${mdMode === 'raw' ? ' active' : ''}"
              aria-pressed="${mdMode === 'raw'}"
              title="Raw markdown source">Raw</button>
          </div>
        `;
      }

      // Edit button (write mode only)
      if (isEditable) {
        actionsHtml += `
          <button id="edit-mode-btn" class="btn" title="Edit this file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
        `;
      }
    } else {
      // Edit mode — Save + Cancel
      actionsHtml += `
        <span id="editor-status" class="editor-status" style="display:none" aria-live="polite"></span>
        <button id="editor-cancel-btn" class="btn" title="Discard changes and return to view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Cancel
        </button>
        <button id="editor-save-btn" class="btn btn-success" disabled title="Save changes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
      `;
    }

    // Download always present
    actionsHtml += `
      <a class="btn btn-primary"
         href="/api/browse/file?path=${encodeURIComponent(filePath)}"
         download="${this.escapeHtml(item.name)}"
         title="Download file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </a>
    `;

    // ── Build dirty indicator (edit mode only) ─────────────────────────────
    const dirtyIndicator = mode === 'edit'
      ? `<span id="editor-dirty-indicator" class="dirty-indicator" style="display:none" title="Unsaved changes" aria-label="Unsaved changes">●</span>`
      : '';

    // ── Build body ─────────────────────────────────────────────────────────
    let bodyHtml: string;

    if (mode === 'edit') {
      // Textarea editor — escape the content for safe injection into HTML attribute/textarea
      const safeText = this.escapeHtml(text);
      bodyHtml = `
        <div class="text-preview">
          <textarea id="editor-textarea"
            class="editor-textarea"
            spellcheck="false"
            aria-label="File editor"
            placeholder="Loading…">${safeText}</textarea>
        </div>
      `;
    } else if (isMarkdown && mdMode === 'preview') {
      // Rendered markdown
      const rendered = this.renderMarkdownContent(text);
      bodyHtml = `<div class="md-preview" tabindex="0" aria-label="Markdown preview">${rendered}</div>`;
    } else {
      // Syntax-highlighted read-only code view
      const shouldHighlight = (item.size ?? text.length) <= HIGHLIGHT_SIZE_LIMIT;
      let codeInner: string;
      if (shouldHighlight) {
        let result: { value: string };
        if (language && hljs.getLanguage(language)) {
          result = hljs.highlight(text, { language, ignoreIllegals: true });
        } else {
          result = hljs.highlightAuto(text);
        }
        codeInner = result.value;
      } else {
        codeInner = this.escapeHtml(text);
      }
      bodyHtml = `
        <div class="code-preview">
          <pre><code class="${shouldHighlight ? 'hljs' : ''}">${codeInner}</code></pre>
        </div>
      `;
    }

    // ── Write final HTML ───────────────────────────────────────────────────
    container.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <svg class="file-icon text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>${this.escapeHtml(item.name)}</span>
          ${langBadge}
          ${dirtyIndicator}
        </div>
        <div class="preview-actions">${actionsHtml}</div>
      </div>
      ${bodyHtml}
    `;

    // ── Wire up event listeners ────────────────────────────────────────────
    this.wireTextPreviewListeners(text);
  }

  /**
   * Attaches all interactive event listeners after renderTextPreviewUI() writes HTML.
   */
  private wireTextPreviewListeners(originalText: string) {
    // Markdown toggle buttons
    document.getElementById('md-preview-btn')?.addEventListener('click', () => {
      this.mdDisplayMode = 'preview';
      this.renderTextPreviewUI();
    });

    document.getElementById('md-raw-btn')?.addEventListener('click', () => {
      this.mdDisplayMode = 'raw';
      this.renderTextPreviewUI();
    });

    // Edit button
    document.getElementById('edit-mode-btn')?.addEventListener('click', () => {
      this.enterEditMode();
    });

    // Cancel button
    document.getElementById('editor-cancel-btn')?.addEventListener('click', () => {
      this.exitEditMode();
    });

    // Textarea input → dirty tracking
    const textarea = document.querySelector<HTMLTextAreaElement>('#editor-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => this.onEditorInput(textarea));
    }

    // Save button
    document.getElementById('editor-save-btn')?.addEventListener('click', () => {
      this.saveFile();
    });
  }

  /**
   * Switches from view mode to edit mode. No prompt needed (no dirty state yet).
   */
  private enterEditMode() {
    this.fileViewMode = 'edit';
    this.renderTextPreviewUI();
    // Focus the textarea immediately for ergonomics
    const textarea = document.querySelector<HTMLTextAreaElement>('#editor-textarea');
    textarea?.focus();
  }

  /**
   * Exits edit mode, returning to view mode.
   * Prompts the user if there are unsaved changes unless `force` is true.
   */
  private exitEditMode(force = false) {
    if (!force) {
      const textarea = document.querySelector<HTMLTextAreaElement>('#editor-textarea');
      const isDirty = textarea && textarea.value !== this.editorOriginalContent;
      if (isDirty) {
        const confirmed = window.confirm(
          'You have unsaved changes. Discard them and return to view?'
        );
        if (!confirmed) return;
      }
    }
    this.fileViewMode = 'view';
    this.renderTextPreviewUI();
  }

  private onEditorInput(textarea: HTMLTextAreaElement) {
    const isDirty = textarea.value !== this.editorOriginalContent;
    this.setEditorDirty(isDirty);
  }

  private setEditorDirty(dirty: boolean) {
    const saveBtn = document.querySelector<HTMLButtonElement>('#editor-save-btn');
    const dirtyIndicator = document.querySelector<HTMLElement>('#editor-dirty-indicator');
    if (saveBtn) saveBtn.disabled = !dirty;
    if (dirtyIndicator) dirtyIndicator.style.display = dirty ? '' : 'none';
  }

  private async saveFile() {
    const textarea = document.querySelector<HTMLTextAreaElement>('#editor-textarea');
    const saveBtn = document.querySelector<HTMLButtonElement>('#editor-save-btn');

    if (!textarea || !this.editorFilePath) return;

    const content = textarea.value;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Saving…
      `;
    }
    this.showEditorStatus('', 'success'); // clear previous status

    try {
      const body: { content: string; mtime?: string } = { content };
      if (this.editorMtime) body.mtime = this.editorMtime;

      const res = await authFetch(
        `/api/browse/file?path=${encodeURIComponent(this.editorFilePath)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      // Update tracked state — content now IS the saved baseline
      this.editorOriginalContent = content;
      if (data.mtime) this.editorMtime = data.mtime;
      this.setEditorDirty(false);
      // Invalidate dir cache so file size info refreshes on next navigate
      this.fileCache.delete(this.currentPath);

      this.showEditorStatus('✓ Saved', 'success');
    } catch (err) {
      this.showEditorStatus(`✗ ${(err as Error).message}`, 'error');
      // Re-enable save so user can retry
      if (saveBtn) saveBtn.disabled = false;
    } finally {
      if (saveBtn) {
        saveBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        `;
      }
    }
  }

  private showEditorStatus(message: string, type: 'success' | 'error') {
    const statusEl = document.querySelector<HTMLElement>('#editor-status');
    if (!statusEl) return;
    if (!message) { statusEl.style.display = 'none'; return; }
    statusEl.textContent = message;
    statusEl.className = `editor-status editor-status--${type}`;
    statusEl.style.display = '';
    if (type === 'success') {
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    }
  }

  /**
   * Renders Markdown source text to HTML using `marked`.
   * Returned HTML is set as innerHTML of a container — keep this in mind
   * for trusted (local filesystem) content; not sanitized for XSS.
   */
  private renderMarkdownContent(source: string): string {
    try {
      const result = marked(source);
      // marked can return a Promise<string> if async:true — guard against that
      if (typeof result === 'string') return result;
      return this.escapeHtml(source); // fallback: raw escaped
    } catch {
      return this.escapeHtml(source);
    }
  }

  // ---------------------------------------------------------------------------
  // PDF / Download previews (unchanged)
  // ---------------------------------------------------------------------------

  private showPdfPreview(filePath: string, item: FileItem) {
    const container = document.getElementById('preview-content');
    if (!container) return;

    container.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <svg class="file-icon file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          ${this.escapeHtml(item.name)}
        </div>
        <div class="preview-actions">
          <a class="btn btn-primary" href="/api/browse/file?path=${encodeURIComponent(filePath)}" download="${this.escapeHtml(item.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </a>
        </div>
      </div>
      <div class="image-preview">
        <iframe src="/api/browse/file?path=${encodeURIComponent(filePath)}"></iframe>
      </div>
    `;
  }

  private showDownloadPreview(item: FileItem) {
    const container = document.getElementById('preview-content');
    if (!container) return;

    const filePath = this.currentPath === '/'
      ? `/${item.name}`
      : `${this.currentPath}/${item.name}`;

    container.innerHTML = `
      <div class="preview-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>${this.escapeHtml(item.name)}</p>
        <p class="preview-subtext">
          File type not recognized — ${item.mimeType || 'Unknown type'} • ${this.formatSize(item.size || 0)}
        </p>
        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
          <button id="open-as-text-btn" class="btn" title="Open this file in the text editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Open in text editor
          </button>
          <a class="btn btn-primary" href="/api/browse/file?path=${encodeURIComponent(filePath)}" download="${this.escapeHtml(item.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download File
          </a>
        </div>
      </div>
    `;

    document.getElementById('open-as-text-btn')?.addEventListener('click', () => {
      void this.showTextPreview(filePath, item);
    });
  }

  private clearPreview() {
    const container = document.getElementById('preview-content');
    if (!container) return;

    // Reset all text-file state when switching away
    this.editorFilePath = null;
    this.editorOriginalContent = null;
    this.editorMtime = null;
    this.fileViewMode = 'view';
    this.currentIsMarkdown = false;
    this.mdDisplayMode = 'preview';
    this.currentItem = null;
    this.currentLanguage = undefined;

    container.innerHTML = `
      <div class="preview-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>Select a file to preview</p>
      </div>
    `;
  }

  private showLoading(show: boolean) {
    const loader = document.getElementById('loading');
    if (loader) {
      loader.classList.toggle('visible', show);
    }
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
