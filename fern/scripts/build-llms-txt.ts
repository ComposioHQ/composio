#!/usr/bin/env bun
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const FERN_DIR = path.join(import.meta.dir, '..');
const DOCS_YML_PATH = path.join(FERN_DIR, 'docs.yml');
const LLMS_TXT_PATH = path.join(FERN_DIR, 'llms-txt-worker', 'public', 'llms.txt');

interface DocsConfig {
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

interface LayoutItem {
  section?: string;
  contents?: ContentItem[];
  page?: string;
  path?: string;
  slug?: string;
}

interface ContentItem {
  page?: string;
  path?: string;
  slug?: string;
  section?: string;
  contents?: ContentItem[];
}

interface LlmsEntry {
  title: string;
  url: string;
  description?: string;
  parentSection?: string; // for prefixing nested items
}

function extractFrontmatter(mdxPath: string): { title?: string; description?: string } {
  try {
    const fullPath = path.join(FERN_DIR, mdxPath);
    if (!fs.existsSync(fullPath)) {
      return {};
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      return {};
    }

    const frontmatter = frontmatterMatch[1];
    
    // Extract title from frontmatter
    const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
    const title = titleMatch ? titleMatch[1].trim() : undefined;
    
    // Extract subtitle (used as description in llms.txt)
    const descMatch = frontmatter.match(/subtitle:\s*["']?(.+?)["']?\s*$/m);
    const description = descMatch ? descMatch[1].trim() : undefined;
    
    return { title, description };
  } catch (error) {
    return {};
  }
}

function buildUrl(item: ContentItem, tabSlug: string, parentSlug?: string): string {
  const BASE_URL = 'https://docs.composio.dev';
  
  if (item.slug) {
    const urlParts = [tabSlug, parentSlug, item.slug].filter(Boolean);
    return `${BASE_URL}/${urlParts.join('/')}`;
  }
  
  if (item.path) {
    const urlPath = item.path
      .replace(/^pages\/(dist|src)\//, '')
      .replace(/^pages\//, '')
      .replace(/\.(mdx?|md)$/, '');
    return `${BASE_URL}/${urlPath}`;
  }
  
  console.warn(`No slug or path for: ${item.page}`);
  return BASE_URL;
}

function processItem(
  item: ContentItem,
  tabSlug: string,
  parentSlug?: string,
  parentSection?: string
): LlmsEntry | null {
  if (!item.page || !item.path) return null;

  const url = buildUrl(item, tabSlug, parentSlug);
  const frontmatter = extractFrontmatter(item.path);
  
  return {
    title: frontmatter.title || item.page,
    url,
    description: frontmatter.description,
    parentSection,
  };
}

function processContentItems(
  items: ContentItem[],
  tabSlug: string,
  parentSlug?: string,
  parentSection?: string
): LlmsEntry[] {
  const entries: LlmsEntry[] = [];

  for (const item of items) {
    const entry = processItem(item, tabSlug, parentSlug, parentSection);
    if (entry) {
      entries.push(entry);
    }

    if (item.contents) {
      const nestedSlug = item.slug 
        ? (parentSlug ? `${parentSlug}/${item.slug}` : item.slug)
        : parentSlug;
      
      // pass section name to children for prefixing
      const nestedEntries = processContentItems(
        item.contents, 
        tabSlug, 
        nestedSlug, 
        item.section ?? parentSection
      );
      entries.push(...nestedEntries);
    }
  }

  return entries;
}

function getSectionName(tab: string, layoutItem: LayoutItem, tabDisplayName: string): string {
  if (tab === 'docs' && layoutItem.section) {
    return layoutItem.section;
  }
  return tabDisplayName;
}

function processNavigation(config: DocsConfig): Array<[string, LlmsEntry[]]> {
  const sections = new Map<string, LlmsEntry[]>();

  for (const navItem of config.navigation) {
    if (!navItem.layout) continue;

    const tab = navItem.tab;
    const tabConfig = config.tabs?.[tab];
    const skipSlug = tabConfig?.['skip-slug'] || false;
    const tabSlug = skipSlug ? '' : tab;
    const tabDisplayName = tabConfig?.['display-name'] || tab;

    for (const layoutItem of navItem.layout) {
      const sectionName = getSectionName(tab, layoutItem, tabDisplayName);
      const sectionEntries: LlmsEntry[] = [];

      // direct page
      if (layoutItem.page && layoutItem.path && layoutItem.slug) {
        const entry = processItem(layoutItem as ContentItem, tabSlug);
        if (entry) {
          sectionEntries.push(entry);
        }
      }

      // nested contents
      if (layoutItem.contents) {
        const entries = processContentItems(
          layoutItem.contents,
          tabSlug,
          layoutItem.slug,
          undefined // no parent section for top-level
        );
        sectionEntries.push(...entries);
      }

      if (sectionEntries.length > 0) {
        const existing = sections.get(sectionName) || [];
        sections.set(sectionName, [...existing, ...sectionEntries]);
      }
    }
  }

  return Array.from(sections.entries());
}

function formatEntry(entry: LlmsEntry): string {
  const displayTitle = entry.parentSection 
    ? `${entry.parentSection}: ${entry.title}`
    : entry.title;
  
  const link = `[${displayTitle}](${entry.url})`;
  return entry.description 
    ? `- ${link}: ${entry.description}`
    : `- ${link}`;
}

function generateLlmsTxt(sections: Array<[string, LlmsEntry[]]>): string {
  let content = '# Composio\n\n';
  content += '> Composio is a platform that connects AI agents to 500+ external tools and services through managed authentication, tool execution, and triggers. It simplifies integrating AI agents with SaaS applications, developer tools, and custom APIs.\n\n';
  content += 'Composio provides managed OAuth and API key authentication, tool execution across multiple AI frameworks (OpenAI, Anthropic, LangChain, CrewAI, etc.), MCP server support, and webhooks/triggers for real-time agent actions.\n';

  for (const [sectionName, entries] of sections) {
    content += `\n## ${sectionName}\n`;
    
    if (sectionName === 'Toolkits') {
      content += '- [Tools JSON](https://docs.composio.dev/robots-only/tools.json): Machine-readable JSON with all 700+ toolkit slugs, descriptions, and tool names\n';
    } else {
      for (const entry of entries) {
        content += formatEntry(entry) + '\n';
      }
    }
  }

  return content;
}

async function main(): Promise<void> {
  console.log('Building llms.txt...');

  try {
    const docsYmlContent = fs.readFileSync(DOCS_YML_PATH, 'utf8');
    const config = yaml.parse(docsYmlContent) as DocsConfig;
    const sections = processNavigation(config);
    
    const totalEntries = sections.reduce((total, [_, entries]) => total + entries.length, 0);
    console.log(`Found ${totalEntries} pages across ${sections.length} sections`);

    const llmsTxtContent = generateLlmsTxt(sections);
    fs.writeFileSync(LLMS_TXT_PATH, llmsTxtContent);
    
    console.log(`Generated ${LLMS_TXT_PATH}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// @ts-ignore - bun-specific
if (import.meta.main) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}