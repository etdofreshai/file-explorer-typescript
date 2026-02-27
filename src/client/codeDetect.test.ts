import { isTextByExtension, getLanguageName, isMarkdownExt } from './codeDetect';

// ---------------------------------------------------------------------------
// isTextByExtension
// ---------------------------------------------------------------------------

describe('isTextByExtension — code extensions', () => {
  const codeFiles = [
    // TypeScript / JavaScript
    'app.ts', 'component.tsx', 'index.js', 'app.jsx',
    'server.mjs', 'worker.cjs',
    // JVM / CLR
    'Main.java', 'Program.cs', 'App.kt', 'build.gradle',
    // Systems
    'main.go', 'lib.rs', 'main.cpp', 'util.c', 'header.h',
    // Scripting
    'script.py', 'app.rb', 'server.php', 'mod.lua', 'analysis.r',
    // Mobile
    'ContentView.swift', 'MainActivity.kt', 'main.dart',
    // Shell
    'deploy.sh', 'setup.bash', 'profile.zsh', 'install.ps1',
    // Config / data
    'config.json', 'settings.yaml', 'config.yml', 'Cargo.toml',
    'config.ini', 'app.cfg', '.env', 'config.xml',
    // Web
    'index.html', 'style.css', 'theme.scss', 'App.vue', 'App.svelte',
    // Docs
    'README.md', 'CONTRIBUTING.mdx', 'notes.txt',
    // Database
    'schema.sql', 'query.graphql',
    // Misc text
    'error.log', 'changes.diff',
  ];

  it.each(codeFiles)('should detect %s as text', (filename) => {
    expect(isTextByExtension(filename)).toBe(true);
  });
});

describe('isTextByExtension — well-known extensionless filenames', () => {
  const textFilenames = [
    'Dockerfile', 'Makefile', 'Jenkinsfile', 'Vagrantfile',
    'Gemfile', 'Rakefile', '.gitignore', '.dockerignore',
    '.editorconfig', '.env', '.babelrc', 'LICENSE', 'README',
  ];

  it.each(textFilenames)('should detect %s as text', (filename) => {
    expect(isTextByExtension(filename)).toBe(true);
  });
});

describe('isTextByExtension — binary files', () => {
  const binaryFiles = [
    'photo.jpg', 'icon.png', 'animation.gif', 'video.mp4',
    'archive.zip', 'app.exe', 'lib.so', 'binary.bin',
    'font.woff2', 'data.db', 'image.webp',
  ];

  it.each(binaryFiles)('should NOT detect %s as text', (filename) => {
    expect(isTextByExtension(filename)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLanguageName
// ---------------------------------------------------------------------------

describe('getLanguageName — extension → highlight.js language', () => {
  const cases: Array<[string, string]> = [
    ['app.ts', 'typescript'],
    ['component.tsx', 'typescript'],
    ['index.js', 'javascript'],
    ['App.jsx', 'javascript'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
    ['Main.java', 'java'],
    ['Program.cs', 'csharp'],
    ['app.py', 'python'],
    ['script.rb', 'ruby'],
    ['server.php', 'php'],
    ['app.kt', 'kotlin'],
    ['main.swift', 'swift'],
    ['main.cpp', 'cpp'],
    ['main.c', 'c'],
    ['header.h', 'c'],
    ['deploy.sh', 'bash'],
    ['config.json', 'json'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
    ['Cargo.toml', 'toml'],
    ['config.ini', 'ini'],
    ['index.html', 'xml'],
    ['App.vue', 'xml'],
    ['App.svelte', 'xml'],
    ['style.css', 'css'],
    ['theme.scss', 'scss'],
    ['README.md', 'markdown'],
    ['schema.sql', 'sql'],
    ['query.graphql', 'graphql'],
    ['changes.diff', 'diff'],
  ];

  it.each(cases)('getLanguageName(%s) → %s', (filename, expected) => {
    expect(getLanguageName(filename)).toBe(expected);
  });
});

describe('getLanguageName — extensionless filenames', () => {
  it('should return dockerfile for Dockerfile', () => {
    expect(getLanguageName('Dockerfile')).toBe('dockerfile');
  });

  it('should return makefile for Makefile', () => {
    expect(getLanguageName('Makefile')).toBe('makefile');
  });

  it('should return ruby for Vagrantfile', () => {
    expect(getLanguageName('Vagrantfile')).toBe('ruby');
  });

  it('should return ruby for Gemfile', () => {
    expect(getLanguageName('Gemfile')).toBe('ruby');
  });
});

describe('getLanguageName — unknown extensions', () => {
  it('should return undefined for binary files', () => {
    expect(getLanguageName('photo.jpg')).toBeUndefined();
    expect(getLanguageName('video.mp4')).toBeUndefined();
    expect(getLanguageName('archive.zip')).toBeUndefined();
  });

  it('should return undefined for unknown text extensions', () => {
    // Not in the language map — callers should fall back to auto-detect
    expect(getLanguageName('notes.txt')).toBeUndefined();
    expect(getLanguageName('data.csv')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isMarkdownExt
// ---------------------------------------------------------------------------

describe('isMarkdownExt — markdown extensions', () => {
  const markdownFiles = [
    'README.md', 'CHANGELOG.md', 'notes.markdown', 'doc.mdx',
    'README.MD', 'doc.MARKDOWN', // case-insensitive
  ];

  it.each(markdownFiles)('should detect %s as markdown', (filename) => {
    expect(isMarkdownExt(filename)).toBe(true);
  });
});

describe('isMarkdownExt — non-markdown files', () => {
  const nonMarkdown = [
    'app.ts', 'index.html', 'style.css', 'data.json',
    'script.py', 'photo.jpg', 'archive.zip', 'Dockerfile',
  ];

  it.each(nonMarkdown)('should NOT detect %s as markdown', (filename) => {
    expect(isMarkdownExt(filename)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('should handle filenames with multiple dots', () => {
    expect(isTextByExtension('server.test.ts')).toBe(true);
    expect(getLanguageName('server.test.ts')).toBe('typescript');
  });

  it('should be case-insensitive', () => {
    expect(isTextByExtension('APP.TS')).toBe(true);
    expect(getLanguageName('APP.TS')).toBe('typescript');
    expect(isTextByExtension('README.MD')).toBe(true);
  });

  it('should handle dotfiles (leading dot)', () => {
    expect(isTextByExtension('.gitignore')).toBe(true);
    expect(isTextByExtension('.eslintrc')).toBe(false); // not in TEXT_FILENAMES
    // .eslintrc has no listed extension, so it returns false — expected
  });
});
