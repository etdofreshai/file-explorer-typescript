/**
 * Extension-based text-file detection and syntax-highlighting language mapping.
 *
 * Provides two capabilities:
 *  1. `isTextByExtension(filename)` — true for known code/config/log extensions
 *     even when the server returns a generic MIME type (e.g. application/octet-stream).
 *  2. `getLanguageName(filename)` — highlight.js language identifier for the file,
 *     or `undefined` when no specific language is known (fallback to auto-detect).
 */

// ---------------------------------------------------------------------------
// Extension / filename sets
// ---------------------------------------------------------------------------

/**
 * File extensions that are always treated as human-readable text, regardless
 * of what the server's Content-Type says.
 */
const TEXT_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  // JVM / CLR
  'cs', 'java', 'kt', 'kts', 'scala', 'groovy', 'gradle',
  // Systems languages
  'go', 'rs', 'cpp', 'cxx', 'cc', 'c', 'h', 'hpp', 'hxx',
  // Scripting
  'py', 'rb', 'php', 'pl', 'pm', 'lua', 'r',
  // Mobile
  'swift', 'dart',
  // Shell
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'cmd', 'bat',
  // Data / Config
  'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'properties', 'xml', 'plist',
  // Web / Markup
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro',
  // Documentation / text
  'md', 'mdx', 'markdown', 'rst', 'txt', 'text', 'adoc',
  // Database / Query
  'sql', 'graphql', 'gql',
  // Build / CI
  'tf', 'hcl', 'proto',
  // Misc
  'log', 'diff', 'patch', 'lock',
]);

/**
 * Exact filenames (lowercased) with no extension that are always text.
 */
const TEXT_FILENAMES = new Set([
  'dockerfile', 'makefile', 'gnumakefile', 'cmakelists.txt',
  'jenkinsfile', 'vagrantfile', 'brewfile',
  'procfile', 'rakefile', 'gemfile', 'guardfile', 'podfile',
  '.gitignore', '.gitattributes', '.dockerignore', '.editorconfig',
  '.eslintignore', '.prettierignore', '.npmignore', '.babelrc',
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  'license', 'licence', 'authors', 'contributors', 'notice',
  'changelog', 'readme', 'todo', 'notes', 'contributing',
]);

// ---------------------------------------------------------------------------
// highlight.js language map
// ---------------------------------------------------------------------------

/**
 * Maps a file extension to a highlight.js language identifier.
 * Languages listed here must be registered in FileExplorer.ts.
 */
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  cs: 'csharp',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  groovy: 'groovy',
  go: 'go',
  rs: 'rust',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',
  py: 'python',
  rb: 'ruby',
  php: 'php',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  swift: 'swift',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  plist: 'xml',
  vue: 'xml',
  svelte: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  rst: 'plaintext',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'hcl',
  hcl: 'hcl',
  proto: 'protobuf',
  diff: 'diff',
  patch: 'diff',
};

/**
 * Exact lowercased filenames → highlight.js language.
 */
const FILENAME_LANGUAGE_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  jenkinsfile: 'groovy',
  vagrantfile: 'ruby',
  gemfile: 'ruby',
  rakefile: 'ruby',
  podfile: 'ruby',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when the file should be treated as human-readable text,
 * checking the extension first and then the exact filename.
 */
export function isTextByExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = lower.slice(dotIndex + 1);
    if (TEXT_EXTENSIONS.has(ext)) return true;
  }
  // Exact filename match handles dotfiles and extensionless tool files
  const basename = lower.split('/').pop() ?? lower;
  return TEXT_FILENAMES.has(basename);
}

/**
 * Returns the highlight.js language identifier for `filename`, or `undefined`
 * when no specific language is known (caller should fall back to auto-detect).
 */
export function getLanguageName(filename: string): string | undefined {
  const lower = filename.toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = lower.slice(dotIndex + 1);
    if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];
  }
  const basename = lower.split('/').pop() ?? lower;
  return FILENAME_LANGUAGE_MAP[basename];
}

/**
 * Returns true when the filename has a Markdown extension (.md, .markdown, .mdx).
 * Used to determine whether to show the rendered Preview / Raw toggle.
 */
export function isMarkdownExt(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return ext === 'md' || ext === 'markdown' || ext === 'mdx';
}
