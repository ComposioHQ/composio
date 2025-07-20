#!/usr/bin/env bun
/* eslint-disable no-console */

import fs, { watch } from 'fs';
import path from 'path';

// Use default directories (no positional args for folder names)
const DOCS_SRC_DIR = path.join(import.meta.dir, '../pages/src');
const PAGES_DIST_DIR = path.join(import.meta.dir, '../pages/dist');
const PROJECT_ROOT = path.join(import.meta.dir, '../..');

// Custom error class for SnippetCode errors
class SnippetCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnippetCodeError';
  }
}

// Type for parsed GitHub URL
interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

interface SnippetCodeProps {
  src?: string;
  githubUrl?: string;
  startLine?: number;
  endLine?: number;
  highlightStart?: number;
  highlightEnd?: number;
  title?: string;
  language?: string;
  wordWrap?: boolean;
  relativeHighlightStart?: number;
  relativeHighlightEnd?: number;
  path?: string;
  vars?: Record<string, string>;
}

// Parse GitHub URL and extract components
function parseGitHubUrl(url: string): ParsedGitHubUrl {
  try {
    // Validate URL format
    const githubRegex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+?)(?:#L(\d+)(?:-L(\d+))?)?$/;
    const match = url.match(githubRegex);
    
    if (!match) {
      throw new SnippetCodeError(
        `Invalid GitHub URL format. Expected: https://github.com/owner/repo/blob/branch/path/to/file.ext#L1-L10\nReceived: ${url}`
      );
    }
    
    const [, owner, repo, branch, filePath, startLineStr, endLineStr] = match;
    
    return {
      owner,
      repo,
      branch,
      filePath,
      startLine: startLineStr ? parseInt(startLineStr, 10) : undefined,
      endLine: endLineStr ? parseInt(endLineStr, 10) : startLineStr ? parseInt(startLineStr, 10) : undefined
    };
  } catch (error) {
    if (error instanceof SnippetCodeError) {
      throw error;
    }
    throw new SnippetCodeError(`Failed to parse GitHub URL: ${error.message}`);
  }
}

// Cache for GitHub content to avoid repeated fetches
const githubContentCache = new Map<string, { content?: string; error?: string }>();

// Fetch content from GitHub with error handling
async function fetchGitHubContent(parsedUrl: ParsedGitHubUrl): Promise<{ content?: string; error?: string }> {
  const cacheKey = `${parsedUrl.owner}/${parsedUrl.repo}/${parsedUrl.branch}/${parsedUrl.filePath}`;
  
  // Check cache first
  if (githubContentCache.has(cacheKey)) {
    return githubContentCache.get(cacheKey)!;
  }
  
  try {
    const rawUrl = `https://raw.githubusercontent.com/${parsedUrl.owner}/${parsedUrl.repo}/${parsedUrl.branch}/${parsedUrl.filePath}`;
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(rawUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      let error: string;
      if (response.status === 404) {
        error = `File not found: ${parsedUrl.filePath} in ${parsedUrl.owner}/${parsedUrl.repo}@${parsedUrl.branch}`;
      } else {
        error = `GitHub API error: ${response.status} ${response.statusText}`;
      }
      const result = { error };
      githubContentCache.set(cacheKey, result);
      return result;
    }
    
    const content = await response.text();
    const result = { content };
    githubContentCache.set(cacheKey, result);
    return result;
  } catch (error: any) {
    let errorMessage: string;
    if (error.name === 'AbortError') {
      errorMessage = `Timeout fetching from GitHub: ${parsedUrl.owner}/${parsedUrl.repo}/${parsedUrl.filePath}`;
    } else if (error.message.includes('fetch')) {
      errorMessage = `Network error fetching from GitHub: ${error.message}`;
    } else {
      errorMessage = `Error fetching from GitHub: ${error.message}`;
    }
    const result = { error: errorMessage };
    githubContentCache.set(cacheKey, result);
    return result;
  }
}

// Extract lines from content
function extractLinesFromContent(content: string, startLine?: number, endLine?: number): string {
  const lines = content.split('\n');
  const start = startLine ? startLine - 1 : 0;
  const end = endLine ? endLine : Math.min(lines.length, 100); // Default to first 100 lines
  
  return lines.slice(start, end).join('\n');
}

function ensureDistDir() {
  // Remove existing dist directory to ensure clean build

  // Create fresh dist directory
  fs.mkdirSync(PAGES_DIST_DIR, { recursive: true });
}

// Replace template variables in content
function replaceTemplateVariables(content: string, vars: Record<string, string> = {}): string {
  // Replace {{variable}} patterns with their values
  return content.replace(/\{\{(\w+)(?:\|(\w+)(?::([^}]+))?)?\}\}/g, (match, varName, transform, defaultValue) => {
    let value = vars[varName];
    
    // Use default value if variable not found
    if (value === undefined || value === null) {
      if (defaultValue !== undefined) {
        value = defaultValue.replace(/^["']|["']$/g, ''); // Remove quotes from default value
      } else {
        return match; // Keep original placeholder if no value and no default
      }
    }
    
    // Apply transformations
    if (transform) {
      switch (transform.toLowerCase()) {
        case 'lower':
          value = value.toLowerCase();
          break;
        case 'upper':
          value = value.toUpperCase();
          break;
        case 'title':
          value = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
          break;
      }
    }
    
    return value;
  });
}

function getLanguageFromPath(filePath: string): { syntax: string; displayName: string } {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, { syntax: string; displayName: string }> = {
    py: { syntax: 'python', displayName: 'Python' },
    js: { syntax: 'javascript', displayName: 'JavaScript' },
    ts: { syntax: 'typescript', displayName: 'TypeScript' },
    tsx: { syntax: 'typescript', displayName: 'TypeScript' },
    jsx: { syntax: 'javascript', displayName: 'JavaScript' },
    java: { syntax: 'java', displayName: 'Java' },
    cpp: { syntax: 'cpp', displayName: 'C++' },
    c: { syntax: 'c', displayName: 'C' },
    go: { syntax: 'go', displayName: 'Go' },
    rs: { syntax: 'rust', displayName: 'Rust' },
    php: { syntax: 'php', displayName: 'PHP' },
    rb: { syntax: 'ruby', displayName: 'Ruby' },
    swift: { syntax: 'swift', displayName: 'Swift' },
    kt: { syntax: 'kotlin', displayName: 'Kotlin' },
    scala: { syntax: 'scala', displayName: 'Scala' },
    sh: { syntax: 'bash', displayName: 'Bash' },
    yml: { syntax: 'yaml', displayName: 'YAML' },
    yaml: { syntax: 'yaml', displayName: 'YAML' },
    json: { syntax: 'json', displayName: 'JSON' },
    xml: { syntax: 'xml', displayName: 'XML' },
    html: { syntax: 'html', displayName: 'HTML' },
    css: { syntax: 'css', displayName: 'CSS' },
    scss: { syntax: 'scss', displayName: 'SCSS' },
    sql: { syntax: 'sql', displayName: 'SQL' },
  };
  return languageMap[extension || ''] || { syntax: 'text', displayName: 'Text' };
}

function readFileLines(
  filePath: string,
  contextDir: string,
  startLine?: number,
  endLine?: number
): string {
  try {
    let fullPath: string;

    // If the path starts with './' or '../', resolve it relative to the context directory
    if (filePath.startsWith('./') || filePath.startsWith('../')) {
      fullPath = path.resolve(contextDir, filePath);
    } else if (filePath.startsWith('fern/')) {
      // For paths starting with 'fern/', we need to find the actual fern directory
      // The MDX file might be in tools/, pages/dist/, etc., but we want to resolve
      // relative to the actual fern directory
      
      // Try multiple possible locations for the fern directory
      const possiblePaths = [
        path.resolve(PROJECT_ROOT, '..', filePath), // composio1/fern/...
        path.resolve(PROJECT_ROOT, filePath), // Already in fern/...
        path.resolve(contextDir, '..', '..', filePath), // Relative to context
      ];
      
      // Find the first path that exists
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          fullPath = possiblePath;
          break;
        }
      }
      
      if (!fullPath) {
        // If none found, use the most likely path
        fullPath = path.resolve(PROJECT_ROOT, '..', filePath);
      }
    } else {
      // Otherwise, resolve it relative to the project root
      fullPath = path.resolve(PROJECT_ROOT, filePath);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    const start = startLine ? startLine - 1 : 0;
    const end = endLine ? endLine : lines.length;

    return lines.slice(start, end).join('\n');
  } catch (error) {
    console.warn(`⚠️  Failed to read file: ${filePath} (resolved to: ${fullPath})`, error);
    return `// File not found: ${filePath}`;
  }
}

function generateHighlightString(
  startLine: number,
  highlightStart?: number,
  highlightEnd?: number
): string {
  if (!highlightStart || !highlightEnd) return '';

  // Convert to relative line numbers (relative to the excerpt)
  const relativeStart = highlightStart - startLine + 1;
  const relativeEnd = highlightEnd - startLine + 1;

  if (relativeStart === relativeEnd) {
    return `{${relativeStart}}`;
  }
  return `{${relativeStart}-${relativeEnd}}`;
}

async function parseSnippetCodeTags(content: string, contextDir: string): Promise<string> {
  const exampleCodeRegex = /<SnippetCode\s+([^>]*?)(?:\s*\/?>|>\s*<\/SnippetCode>)/g;
  const matches: Array<{ match: string; propsString: string }> = [];
  
  let match;
  while ((match = exampleCodeRegex.exec(content)) !== null) {
    matches.push({ match: match[0], propsString: match[1] });
  }
  
  let result = content;
  
  for (const { match, propsString } of matches) {
    const replacement = await (async () => {
    // Parse props from the tag
    const props: Partial<SnippetCodeProps> = {};

    // Extract src
    const srcMatch = propsString.match(/src=["']([^"']+)["']/);
    if (srcMatch) props.src = srcMatch[1];
    
    // Extract githubUrl
    const githubUrlMatch = propsString.match(/githubUrl=["']([^"']+)["']/);
    if (githubUrlMatch) props.githubUrl = githubUrlMatch[1];

    // Extract other numeric props (handle both JSX {1} and quoted "1" syntax)
    const startLineMatch = propsString.match(/startLine=(?:["'](\d+)["']|{(\d+)})/);
    if (startLineMatch) props.startLine = parseInt(startLineMatch[1] || startLineMatch[2]);

    const endLineMatch = propsString.match(/endLine=(?:["'](\d+)["']|{(\d+)})/);
    if (endLineMatch) props.endLine = parseInt(endLineMatch[1] || endLineMatch[2]);

    const highlightStartMatch = propsString.match(/highlightStart=(?:["'](\d+)["']|{(\d+)})/);
    if (highlightStartMatch)
      props.highlightStart = parseInt(highlightStartMatch[1] || highlightStartMatch[2]);

    const highlightEndMatch = propsString.match(/highlightEnd=(?:["'](\d+)["']|{(\d+)})/);
    if (highlightEndMatch)
      props.highlightEnd = parseInt(highlightEndMatch[1] || highlightEndMatch[2]);

    // Extract string props
    const titleMatch = propsString.match(/title=["']([^"']+)["']/);
    if (titleMatch) props.title = titleMatch[1];

    const pathMatch = propsString.match(/path=["']([^"']+)["']/);
    if (pathMatch) props.path = pathMatch[1];

    const languageMatch = propsString.match(/language=["']([^"']+)["']/);
    if (languageMatch) props.language = languageMatch[1];

    const relativeHighlightStartMatch = propsString.match(
      /relativeHighlightStart=(?:["'](\d+)["']|{(\d+)})/
    );
    if (relativeHighlightStartMatch)
      props.relativeHighlightStart = parseInt(
        relativeHighlightStartMatch[1] || relativeHighlightStartMatch[2]
      );

    const relativeHighlightEndMatch = propsString.match(
      /relativeHighlightEnd=(?:["'](\d+)["']|{(\d+)})/
    );
    if (relativeHighlightEndMatch)
      props.relativeHighlightEnd = parseInt(
        relativeHighlightEndMatch[1] || relativeHighlightEndMatch[2]
      );

    // Extract vars object prop
    const varsMatch = propsString.match(/vars=\{({[^}]*})\}/);
    if (varsMatch) {
      try {
        // Parse the vars object - need to handle JSX syntax
        const varsString = varsMatch[1];
        // Convert JSX object syntax to JSON
        const jsonString = varsString
          .replace(/(\w+):/g, '"$1":') // Add quotes around keys
          .replace(/:\s*"([^"]+)"/g, ':"$1"') // Ensure values are quoted
          .replace(/:\s*'([^']+)'/g, ':"$1"'); // Convert single quotes to double
        props.vars = JSON.parse(`{${jsonString}}`);
      } catch (error) {
        console.warn(`⚠️  Failed to parse vars prop: ${varsMatch[1]}`);
      }
    }

    // Extract wordWrap boolean prop
    const wordWrapMatch = propsString.match(/wordWrap=(?:["']?(true|false)["']?|{(true|false)})/);
    if (wordWrapMatch) {
      props.wordWrap = (wordWrapMatch[1] || wordWrapMatch[2]) === 'true';
    } else if (propsString.includes('wordWrap')) {
      // Handle case where wordWrap is specified without a value (defaults to true)
      props.wordWrap = true;
    }

    // Validate that either src or githubUrl is provided
    if (!props.src && !props.githubUrl) {
      const errorMessage = 'SnippetCode tag missing both src and githubUrl attributes';
      console.warn(`⚠️  ${errorMessage}:`, match);
      return `\`\`\`error\n${errorMessage}\n\nProps: ${JSON.stringify(props, null, 2)}\n\nFix the issue above and rebuild.\n\`\`\``;
    }

    let codeContent: string;
    let filePath: string;
    let langInfo: { syntax: string; displayName: string };
    
    try {
      if (props.githubUrl) {
        // Handle GitHub URL
        const parsedUrl = parseGitHubUrl(props.githubUrl);
        
        // Fetch content from GitHub
        const fetchResult = await fetchGitHubContent(parsedUrl);
        
        if (fetchResult.error) {
          console.error(`❌ SnippetCode Error: ${fetchResult.error}`);
          return `\`\`\`error\nSnippetCode Error: ${fetchResult.error}\n\nProps: ${JSON.stringify(props, null, 2)}\n\nFix the issue above and rebuild.\n\`\`\``;
        }
        
        // Extract lines based on URL or manual overrides
        const startLine = props.startLine || parsedUrl.startLine || 1;
        const endLine = props.endLine || parsedUrl.endLine || 100;
        
        codeContent = extractLinesFromContent(fetchResult.content!, startLine, endLine);
        filePath = parsedUrl.filePath;
        langInfo = getLanguageFromPath(filePath);
      } else {
        // Handle local file
        codeContent = readFileLines(props.src!, contextDir, props.startLine, props.endLine);
        filePath = props.src!;
        langInfo = getLanguageFromPath(filePath);
      }
      
      // Apply variable replacements if vars are provided
      if (props.vars && Object.keys(props.vars).length > 0) {
        codeContent = replaceTemplateVariables(codeContent, props.vars);
      }
    } catch (error) {
      const errorMessage = error instanceof SnippetCodeError ? error.message : `Unexpected error: ${error.message}`;
      console.error(`❌ SnippetCode Error: ${errorMessage}`);
      return `\`\`\`error\nSnippetCode Error: ${errorMessage}\n\nProps: ${JSON.stringify(props, null, 2)}\n\nFix the issue above and rebuild.\n\`\`\``;
    }
    
    const syntax = props.language || langInfo.syntax;
    const displayName = langInfo.displayName;

    // Generate highlight string if needed
    let highlightString = '';
    if (props.relativeHighlightStart && props.relativeHighlightEnd) {
      // Use relative highlights directly
      if (props.relativeHighlightStart === props.relativeHighlightEnd) {
        highlightString = `{${props.relativeHighlightStart}}`;
      } else {
        highlightString = `{${props.relativeHighlightStart}-${props.relativeHighlightEnd}}`;
      }
    } else if (props.highlightStart && props.highlightEnd) {
      // Use absolute highlights and convert to relative
      highlightString = generateHighlightString(
        props.startLine || 1,
        props.highlightStart,
        props.highlightEnd
      );
    }

    // Use title priority: explicit title > path > implicit title (displayName)
    const title = props.title || props.path || displayName;
    const titleComment = ` title="${title}"`;

    // Create the code block with syntax, display name, and maxLines
    const codeBlock = `\`\`\`${syntax} ${displayName}${highlightString ? ` ${highlightString}` : ''}${titleComment} maxLines=40 ${props.wordWrap ? 'wordWrap' : ''}\n${codeContent}\n\`\`\``;

    return codeBlock;
    })();
    
    result = result.replace(match, replacement);
  }
  
  return result;
}

async function processFile(srcPath: string, distPath: string) {
  try {
    const content = fs.readFileSync(srcPath, 'utf8');
    const contextDir = path.dirname(srcPath);
    const processedContent = await parseSnippetCodeTags(content, contextDir);

    // Ensure the directory exists
    const distDir = path.dirname(distPath);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(distPath, processedContent);
    console.log(
      `✅ Processed: ${path.relative(DOCS_SRC_DIR, srcPath)} -> ${path.relative(PAGES_DIST_DIR, distPath)}`
    );
  } catch (error) {
    console.error(`❌ Error processing ${srcPath}:`, error);
  }
}

function isMarkdownFile(filename: string): boolean {
  return filename.endsWith('.mdx') || filename.endsWith('.md');
}

async function processAllFiles() {
  console.log('🔄 Processing all .mdx and .md files...');

  async function processDirectory(srcDir: string) {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    const promises: Promise<void>[] = [];

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);

      if (entry.isDirectory()) {
        // Skip dist directory to avoid infinite loops
        if (entry.name === 'dist') continue;
        promises.push(processDirectory(srcPath));
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        // Calculate the relative path from the source directory
        const relativePath = path.relative(DOCS_SRC_DIR, srcPath);

        // Always preserve directory structure
        const distPath = path.join(PAGES_DIST_DIR, relativePath);

        promises.push(processFile(srcPath, distPath));
      }
    }
    
    await Promise.all(promises);
  }

  await processDirectory(DOCS_SRC_DIR);
  console.log('✅ All files processed');
}

// Watch for changes and reprocess
function startWatchMode() {
  console.log('👀 Watching for changes...');

  const watcher = watch(DOCS_SRC_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (!isMarkdownFile(filename)) return;

    const srcPath = path.join(DOCS_SRC_DIR, filename);

    // Always preserve directory structure
    const distPath = path.join(PAGES_DIST_DIR, filename);

    if (eventType === 'change' && fs.existsSync(srcPath)) {
      console.log(`🔄 File changed: ${filename}`);
      processFile(srcPath, distPath).catch(error => {
        console.error(`❌ Error processing ${filename}:`, error);
      });
    }
  });

  // Also watch source files that might be referenced
  const sourceWatcher = watch(PROJECT_ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes('node_modules')) return;
    if (filename.includes('.git')) return;
    if (filename.includes('fern/pages')) return; // Skip pages (output) files
    if (filename.includes('fern/scripts')) return; // Skip the script itself

    // If a source file changes, reprocess all .mdx and .md files since we don't know which ones reference it
    if (
      eventType === 'change' &&
      (filename.endsWith('.ts') || filename.endsWith('.js') || filename.endsWith('.py'))
    ) {
      console.log(`🔄 Source file changed: ${filename}, reprocessing all .mdx and .md files...`);
      processAllFiles();
    }
  });

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping watchers...');
    watcher.close();
    sourceWatcher.close();
    process.exit(0);
  });
}

// Main function
async function main() {
  console.log('🚀 Starting SnippetCode processor...');
  console.log(`Source: ${DOCS_SRC_DIR}`);
  console.log(`Dist:   ${PAGES_DIST_DIR}`);

  ensureDistDir();
  await processAllFiles();

  // Check if we should run in watch mode
  const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');

  if (isWatchMode) {
    startWatchMode();
  } else {
    console.log('✅ Processing complete. Use --watch flag to enable watch mode.');
  }
}

// Run the main function directly
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
