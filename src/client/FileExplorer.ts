import { showError } from './main.js';

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

export class FileExplorer {
  private currentPath = '/';
  private selectedFile: FileItem | null = null;
  private fileCache = new Map<string, DirectoryListing>();

  constructor() {
    this.init();
  }

  private async init() {
    this.showLoading(true);
    try {
      await this.navigate('/');
    } catch (error) {
      console.error('Failed to initialize:', error);
      showError('Failed to load file explorer');
    } finally {
      this.showLoading(false);
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
    // Check cache first
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

    // Add root
    const rootBtn = this.createBreadcrumbItem('Root', '/', true);
    container.appendChild(rootBtn);

    if (this.currentPath === '/') return;

    // Add path segments
    const segments = this.currentPath.split('/').filter(Boolean);
    let builtPath = '';

    segments.forEach((segment, index) => {
      builtPath += '/' + segment;
      const isLast = index === segments.length - 1;

      // Add separator
      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = '/';
      container.appendChild(separator);

      // Add item
      const item = this.createBreadcrumbItem(segment, builtPath, isLast);
      container.appendChild(item);
    });

    // Scroll to end
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

    // Add parent directory button if not at root
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

    // Add items
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

    if (item.mimeType) {
      if (item.mimeType.startsWith('image/')) {
        return {
          class: 'image',
          path: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
        };
      }

      if (item.mimeType.startsWith('audio/')) {
        return {
          class: 'audio',
          path: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        };
      }

      if (item.mimeType.startsWith('text/') || item.mimeType === 'application/json') {
        return {
          class: 'text',
          path: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        };
      }
    }

    return {
      class: 'file',
      path: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    };
  }

  private async selectFile(item: FileItem) {
    // Update selection UI
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

    if (!item.isPreviewable) {
      this.showDownloadPreview(item);
      return;
    }

    const filePath = this.currentPath === '/' 
      ? `/${item.name}` 
      : `${this.currentPath}/${item.name}`;

    // Show preview based on type
    if (item.mimeType?.startsWith('image/')) {
      this.showImagePreview(filePath, item);
    } else if (item.mimeType?.startsWith('audio/')) {
      this.showAudioPreview(filePath, item);
    } else if (item.mimeType?.startsWith('text/') || item.mimeType === 'application/json') {
      this.showTextPreview(filePath, item);
    } else if (item.mimeType === 'application/pdf') {
      this.showPdfPreview(filePath, item);
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
      <div class="text-preview">
        <pre>Loading...</pre>
      </div>
    `;

    try {
      const response = await fetch(`/api/browse/file?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Failed to load file');
      
      const text = await response.text();
      const pre = container.querySelector('pre');
      if (pre) {
        pre.textContent = text;
      }
    } catch (error) {
      const pre = container.querySelector('pre');
      if (pre) {
        pre.textContent = `Error loading file: ${(error as Error).message}`;
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
        <iframe src="/api/browse/file?path=${encodeURIComponent(filePath)}" style="width:100%;height:100%;border:none;"></iframe>
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
        <p style="font-size: 12px; opacity: 0.7; margin-top: 8px;">
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
