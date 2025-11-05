#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

// Shared directories
export const FERN_DIR = path.join(import.meta.dir, '..');
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

export function ensureOutputDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}