#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

// Define directories
export const FERN_DIR = path.join(import.meta.dir, '../..');
export const DOCS_YML_PATH = path.join(FERN_DIR, 'docs.yml');
export const LLMS_TXT_PATH = path.join(FERN_DIR, 'llms-txt-worker', 'public', 'llms.txt');
export const TOOLS_JSON_PATH = path.join(
  FERN_DIR,
  'llms-txt-worker',
  'public',
  'robots-only',
  'tools.json'
);
export const PAGES_DIR = path.join(FERN_DIR, 'pages');
export const TOOLKITS_DIR = path.join(FERN_DIR, 'toolkits');

export interface DocsConfig {
  title: string;
  navigation: Array<{
    tab: string;
    layout?: LayoutItem[];
  }>;
  tabs?: {
    [key: string]: {
      'display-name': string;
      'skip-slug'?: boolean;
    };
  };
}

export interface LayoutItem {
  section?: string;
  contents?: ContentItem[];
  page?: string;
  path?: string;
  slug?: string;
}

export interface ContentItem {
  page?: string;
  path?: string;
  slug?: string;
  section?: string;
  contents?: ContentItem[];
}

export function loadDocsConfig(): DocsConfig {
  const docsYmlContent = fs.readFileSync(DOCS_YML_PATH, 'utf8');
  return yaml.parse(docsYmlContent) as DocsConfig;
}

// Extract description from MDX content
export function extractDescription(mdxPath: string): string | undefined {
  try {
    const fullPath = path.join(FERN_DIR, mdxPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  File not found: ${fullPath}`);
      return undefined;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // Try to extract from frontmatter description
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);
      if (descMatch) {
        return descMatch[1].trim();
      }
    }

    // Extract first meaningful paragraph after the title
    const lines = content.split('\n');
    let inFrontmatter = false;
    let foundTitle = false;
    let description = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Handle frontmatter
      if (trimmedLine === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }

      if (inFrontmatter) continue;

      // Skip titles
      if (trimmedLine.startsWith('#')) {
        foundTitle = true;
        continue;
      }

      // Skip empty lines, code blocks, and JSX
      if (
        !trimmedLine ||
        trimmedLine.startsWith('```') ||
        trimmedLine.startsWith('<') ||
        trimmedLine.startsWith('import ') ||
        trimmedLine.startsWith('export ')
      ) {
        continue;
      }

      // Found a paragraph
      if (foundTitle && trimmedLine.length > 20) {
        description = trimmedLine;
        break;
      }
    }

    // Clean up the description
    if (description) {
      // Remove MDX components and markdown syntax
      description = description
        .replace(/<[^>]+>/g, '') // Remove HTML/JSX tags
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert [text](url) to text
        .replace(/`([^`]+)`/g, '$1') // Remove inline code backticks
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove italic
        .trim();

      // Truncate if too long
      if (description.length > 150) {
        description = description.substring(0, 147) + '...';
      }

      return description;
    }

    return undefined;
  } catch (error) {
    console.warn(`⚠️  Error reading ${mdxPath}:`, error);
    return undefined;
  }
}

// Ensure output directory exists
export function ensureOutputDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}