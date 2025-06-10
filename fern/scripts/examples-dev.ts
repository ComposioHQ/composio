#!/usr/bin/env bun
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import { watch } from 'fs';

const EXAMPLES_SRC_DIR = path.join(import.meta.dir, '../pages/examples');
const EXAMPLES_DIST_DIR = path.join(import.meta.dir, '../pages/examples/dist');
const PROJECT_ROOT = path.join(import.meta.dir, '../..');

interface ExampleCodeProps {
  src: string;
  startLine?: number;
  endLine?: number;
  highlightStart?: number;
  highlightEnd?: number;
  title?: string;
  language?: string;
}

// Ensure dist directory exists
function ensureDistDir() {
  if (!fs.existsSync(EXAMPLES_DIST_DIR)) {
    fs.mkdirSync(EXAMPLES_DIST_DIR, { recursive: true });
  }
}

// Get language from file extension
function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
  };
  return languageMap[extension || ''] || 'text';
}

// Read and extract lines from a file
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

// Generate highlight string for Fern
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

// Parse ExampleCode tags and replace with actual code blocks
function parseExampleCodeTags(content: string): string {
  const exampleCodeRegex = /<ExampleCode\s+([^>]*?)(?:\s*\/?>|>\s*<\/ExampleCode>)/g;

  return content.replace(exampleCodeRegex, (match, propsString) => {
    // Parse props from the tag
    const props: Partial<ExampleCodeProps> = {};

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
      console.warn('⚠️  ExampleCode tag missing src attribute:', match);
      return '```\n// Error: ExampleCode tag missing src attribute\n```';
    }

    // Read the file content
    const codeContent = readFileLines(props.src, props.startLine, props.endLine);
    const language = props.language || getLanguageFromPath(props.src);

    // Generate highlight string if needed
    const highlightString =
      props.highlightStart && props.highlightEnd
        ? generateHighlightString(props.startLine || 1, props.highlightStart, props.highlightEnd)
        : '';

    // Generate the title comment
    const titleComment = props.title ? ` title="${props.title}"` : '';

    // Create the code block
    const codeBlock = `\`\`\`${language}${highlightString ? ` ${highlightString}` : ''}${titleComment}\n${codeContent}\n\`\`\``;

    return codeBlock;
  });
}

// Process a single .mdx file
function processFile(srcPath: string, distPath: string) {
  try {
    const content = fs.readFileSync(srcPath, 'utf8');
    const processedContent = parseExampleCodeTags(content);

    // Ensure the directory exists
    const distDir = path.dirname(distPath);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(distPath, processedContent);
    console.log(
      `✅ Processed: ${path.relative(EXAMPLES_SRC_DIR, srcPath)} -> ${path.relative(EXAMPLES_DIST_DIR, distPath)}`
    );
  } catch (error) {
    console.error(`❌ Error processing ${srcPath}:`, error);
  }
}

// Process all .mdx files in the source directory
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
        const relativePath = path.relative(EXAMPLES_SRC_DIR, srcPath);

        // Remove 'src/' prefix if it exists and create dist path
        const cleanRelativePath = relativePath.startsWith('src/')
          ? relativePath.substring(4) // Remove 'src/' prefix
          : relativePath;

        const distPath = path.join(EXAMPLES_DIST_DIR, cleanRelativePath);
        processFile(srcPath, distPath);
      }
    }
  }

  processDirectory(EXAMPLES_SRC_DIR);
  console.log('✅ All files processed');
}

// Watch for changes and reprocess
function startWatchMode() {
  console.log('👀 Watching for changes...');

  const watcher = watch(EXAMPLES_SRC_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (!filename.endsWith('.mdx')) return;

    // Skip dist files completely - they should never trigger processing
    if (filename.includes('dist/') || filename.includes('dist\\')) {
      return;
    }

    // Only process files in src/ subdirectory
    if (!filename.startsWith('src/') && !filename.startsWith('src\\')) {
      return;
    }

    const srcPath = path.join(EXAMPLES_SRC_DIR, filename);

    // Remove 'src/' prefix and create dist path
    const cleanFilename = filename.substring(4); // Remove 'src/' prefix
    const distPath = path.join(EXAMPLES_DIST_DIR, cleanFilename);

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
    if (filename.includes('fern/pages/examples/dist')) return; // Skip dist files
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
  console.log('🚀 Starting ExampleCode processor...');

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

// Run if this is the main module
if (import.meta.main) {
  main();
}
