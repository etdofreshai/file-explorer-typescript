import { showError } from './main.js';
import { isTextByExtension, getLanguageName } from './codeDetect.js';

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

  // Editor state for the currently open text file
  private editorFilePath: string | null = null;
  private editorOriginalContent: string | null = null;
  private editorMtime: string | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.showLoading(true);
    try {
      await this.fetchHealth();
      await this.navigate('/');
    } catch (error) {
      console.error('Failed to initialize:', error);
      showError('Failed to load file explorer');
    } finally {
      this.showLoading(false);
    }
  }

  private async fetchHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data: HealthResponse = await res.json();
        this.writeEnabled = data.writeEnabled === true;
      }
    } catch {
      this.writeEnabled = false;
    }
  }

  private async navigate(path: string) {
    this.showLoading(true);
    try {
      const listing = await this.fetchDirectory(path);
      this.currentPath = listing.path;
      this.selectedFile = null;

      this.renderBreadcrumb();
      this.renderFileList(listing);
      this.clearPreview();
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

    const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);

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
      container.appendChild(parentItem);
    }

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

    this.selectedFile = item;
    this.clearPreview();

    const container = document.getElementById('preview-content');
    if (!container) return;

    const filePath = this.currentPath === '/'
      ? `/${item.name}`
      : `${this.currentPath}/${item.name}`;

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

  private async showTextPreview(filePath: string, item: FileItem) {
    const container = document.getElementById('preview-content');
    if (!container) return;

    const language = getLanguageName(item.name);

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
          ${language ? `<span class="lang-badge">${this.escapeHtml(language)}</span>` : ''}
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
      <div class="code-preview">
        <pre><code>Loading…</code></pre>
      </div>
    `;

    try {
      const response = await fetch(`/api/browse/file?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Failed to load file');

      const text = await response.text();
      const codeEl = container.querySelector('code');
      if (!codeEl) return;

      const shouldHighlight = (item.size ?? text.length) <= HIGHLIGHT_SIZE_LIMIT;

      if (shouldHighlight) {
        let result: { value: string };
        if (language && hljs.getLanguage(language)) {
          result = hljs.highlight(text, { language, ignoreIllegals: true });
        } else {
          result = hljs.highlightAuto(text);
        }
        codeEl.innerHTML = result.value;
        codeEl.classList.add('hljs');
      } else {
        // File too large — plain text for performance
        codeEl.textContent = text;
      }
    } catch (error) {
      const codeEl = container.querySelector('code');
      if (codeEl) {
        codeEl.textContent = `Error loading file: ${(error as Error).message}`;
      }
    }
  }

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
          ${item.mimeType || 'Unknown type'} • ${this.formatSize(item.size || 0)}
        </p>
        <a class="btn btn-primary" style="margin-top: 16px" href="/api/browse/file?path=${encodeURIComponent(filePath)}" download="${this.escapeHtml(item.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download File
        </a>
      </div>
    `;
  }

  private clearPreview() {
    const container = document.getElementById('preview-content');
    if (!container) return;

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
