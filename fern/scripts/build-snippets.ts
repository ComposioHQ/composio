#!/usr/bin/env bun
/* eslint-disable no-console */

import fs, { watch } from 'fs';
import path from 'path';

const DOCS_SRC_DIR = path.join(import.meta.dir, '../docs');
const PAGES_DIR = path.join(import.meta.dir, '../pages');
const PROJECT_ROOT = path.join(import.meta.dir, '../..');

interface SnippetCodeProps {
  src: string;
  startLine?: number;
  endLine?: number;
  highlightStart?: number;
  highlightEnd?: number;
  title?: string;
  language?: string;
}

function ensureDistDir() {
  // Remove existing pages directory to ensure clean build
  if (fs.existsSync(PAGES_DIR)) {
    fs.rmSync(PAGES_DIR, { recursive: true, force: true });
    console.log('🧹 Cleaned existing pages directory');
  }
  
  // Create fresh pages directory
  fs.mkdirSync(PAGES_DIR, { recursive: true });
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

function readFileLines(filePath: string, startLine?: number, endLine?: number): string {
  try {
    const fullPath = path.resolve(PROJECT_ROOT, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    const start = startLine ? startLine - 1 : 0;
    const end = endLine ? endLine : lines.length;

    return lines.slice(start, end).join('\n');
  } catch (error) {
    console.warn(`⚠️  Failed to read file: ${filePath}`, error);
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

function parseSnippetCodeTags(content: string): string {
  const exampleCodeRegex = /<SnippetCode\s+([^>]*?)(?:\s*\/?>|>\s*<\/SnippetCode>)/g;

  return content.replace(exampleCodeRegex, (match, propsString) => {
    // Parse props from the tag
    const props: Partial<SnippetCodeProps> = {};

    // Extract src
    const srcMatch = propsString.match(/src=["']([^"']+)["']/);
    if (srcMatch) props.src = srcMatch[1];

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

    const languageMatch = propsString.match(/language=["']([^"']+)["']/);
    if (languageMatch) props.language = languageMatch[1];

    if (!props.src) {
      console.warn('⚠️  SnippetCode tag missing src attribute:', match);
      return '```\n// Error: SnippetCode tag missing src attribute\n```';
    }

    // Read the file content
    const codeContent = readFileLines(props.src, props.startLine, props.endLine);
    const langInfo = getLanguageFromPath(props.src);
    const syntax = props.language || langInfo.syntax;
    const displayName = langInfo.displayName;

    // Generate highlight string if needed
    const highlightString =
      props.highlightStart && props.highlightEnd
        ? generateHighlightString(props.startLine || 1, props.highlightStart, props.highlightEnd)
        : '';

    // Use provided title or fall back to language display name
    const title = props.title || displayName;
    const titleComment = ` title="${title}"`;

    // Create the code block with syntax, display name, and maxLines
    const codeBlock = `\`\`\`${syntax} ${displayName}${highlightString ? ` ${highlightString}` : ''}${titleComment} maxLines=40\n${codeContent}\n\`\`\``;

    return codeBlock;
  });
}

function processFile(srcPath: string, distPath: string) {
  try {
    const content = fs.readFileSync(srcPath, 'utf8');
    const processedContent = parseSnippetCodeTags(content);

    // Ensure the directory exists
    const distDir = path.dirname(distPath);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(distPath, processedContent);
    console.log(
      `✅ Processed: ${path.relative(DOCS_SRC_DIR, srcPath)} -> ${path.relative(PAGES_DIR, distPath)}`
    );
  } catch (error) {
    console.error(`❌ Error processing ${srcPath}:`, error);
  }
}

function processAllFiles() {
  console.log('🔄 Processing all .mdx files...');

  function processDirectory(srcDir: string) {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);

      if (entry.isDirectory()) {
        // Skip dist directory to avoid infinite loops
        if (entry.name === 'dist') continue;
        processDirectory(srcPath);
      } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
        // Calculate the relative path from the source directory
        const relativePath = path.relative(DOCS_SRC_DIR, srcPath);
        
        // Check if this file is in the SDK directory
        const isInSDK = relativePath.startsWith('sdk/') || relativePath.startsWith('sdk\\');
        
        // If in SDK, preserve directory structure; otherwise flatten
        const distPath = isInSDK 
          ? path.join(PAGES_DIR, relativePath)
          : path.join(PAGES_DIR, entry.name);
          
        processFile(srcPath, distPath);
      }
    }
  }

  processDirectory(DOCS_SRC_DIR);
  console.log('✅ All files processed');
}

// Watch for changes and reprocess
function startWatchMode() {
  console.log('👀 Watching for changes...');

  const watcher = watch(DOCS_SRC_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (!filename.endsWith('.mdx')) return;

    const srcPath = path.join(DOCS_SRC_DIR, filename);
    
    // Check if this file is in the SDK directory
    const isInSDK = filename.startsWith('sdk/') || filename.startsWith('sdk\\');
    
    // If in SDK, preserve directory structure; otherwise flatten
    const distPath = isInSDK 
      ? path.join(PAGES_DIR, filename)
      : path.join(PAGES_DIR, path.basename(filename));

    if (eventType === 'change' && fs.existsSync(srcPath)) {
      console.log(`🔄 File changed: ${filename}`);
      processFile(srcPath, distPath);
    }
  });

  // Also watch source files that might be referenced
  const sourceWatcher = watch(PROJECT_ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes('node_modules')) return;
    if (filename.includes('.git')) return;
    if (filename.includes('fern/pages')) return; // Skip pages (output) files
    if (filename.includes('fern/scripts')) return; // Skip the script itself

    // If a source file changes, reprocess all .mdx files since we don't know which ones reference it
    if (
      eventType === 'change' &&
      (filename.endsWith('.ts') || filename.endsWith('.js') || filename.endsWith('.py'))
    ) {
      console.log(`🔄 Source file changed: ${filename}, reprocessing all .mdx files...`);
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
function main() {
  console.log('🚀 Starting SnippetCode processor...');

  ensureDistDir();
  processAllFiles();

  // Check if we should run in watch mode
  const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');

  if (isWatchMode) {
    startWatchMode();
  } else {
    console.log('✅ Processing complete. Use --watch flag to enable watch mode.');
  }
}

// Run the main function directly
main();
