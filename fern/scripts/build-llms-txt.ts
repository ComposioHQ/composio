#!/usr/bin/env bun
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import {
  LLMS_TXT_PATH,
  FERN_DIR,
  loadDocsConfig,
  ensureOutputDir,
  type DocsConfig,
  type ContentItem,
} from './lib/docs-utils';

interface LlmsEntry {
  title: string;
  url: string;
  description?: string;
  parentSection?: string;  // Track parent section for nested items
}

// Extract title and description from MDX file frontmatter
function extractFrontmatter(mdxPath: string): { title?: string; description?: string } {
  try {
    const fullPath = path.join(FERN_DIR, mdxPath);
    if (!fs.existsSync(fullPath)) {
      return {};
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // Try to extract from frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      
      // Extract title
      const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
      const title = titleMatch ? titleMatch[1].trim() : undefined;
      
      // Extract subtitle only
      const descMatch = frontmatter.match(/subtitle:\s*["']?(.+?)["']?\s*$/m);
      const description = descMatch ? descMatch[1].trim() : undefined;
      
      return { title, description };
    }

    return {};
  } catch (error) {
    return {};
  }
}

// Process a single content item
function processItem(
  item: ContentItem,
  tabSlug: string,
  parentSlug?: string,
  parentSection?: string
): LlmsEntry | null {
  // Skip items without a page name and path
  if (!item.page || !item.path) {
    return null;
  }

  // Simple URL generation
  let url: string;
  
  if (item.slug) {
    // Use explicit slug from docs.yml
    const urlParts = [tabSlug, parentSlug, item.slug].filter(Boolean);
    url = `https://docs.composio.dev/${urlParts.join('/')}`;
  } else if (item.path) {
    // Derive URL from file path
    let urlPath = item.path
      .replace('pages/dist/', '')
      .replace('pages/src/', '')
      .replace('pages/', '')
      .replace('.mdx', '')
      .replace('.md', '');
    
    url = `https://docs.composio.dev/${urlPath}`;
  } else {
    // This shouldn't happen - all items should have either slug or path
    console.warn(`Warning: No slug or path for item: ${item.page}`);
    return null;
  }

  // Try to extract title and description from MDX file
  const frontmatter = extractFrontmatter(item.path);
  const title = frontmatter.title || item.page;
  const description = frontmatter.description;

  return {
    title,
    url,
    description,
    parentSection,
  };
}

// Process content items recursively (flattened)
function processContentItems(
  items: ContentItem[],
  tabSlug: string,
  parentSlug?: string,
  parentSection?: string
): LlmsEntry[] {
  const entries: LlmsEntry[] = [];

  for (const item of items) {
    // Process the item itself
    const entry = processItem(item, tabSlug, parentSlug, parentSection);
    if (entry) {
      entries.push(entry);
    }

    // Process nested items
    if (item.section && item.contents) {
      // Combine parent slug with item slug for nested sections
      const nestedSlug = item.slug 
        ? (parentSlug ? `${parentSlug}/${item.slug}` : item.slug)
        : parentSlug;
      // Pass the section name down to nested items
      const nestedEntries = processContentItems(item.contents, tabSlug, nestedSlug, item.section);
      entries.push(...nestedEntries);
    }
  }

  return entries;
}

// Process all navigation and organize by sections
function processNavigation(config: DocsConfig): Array<[string, LlmsEntry[]]> {
  const sections: Array<[string, LlmsEntry[]]> = [];

  for (const navItem of config.navigation) {
    if (!navItem.layout) continue;

    const tab = navItem.tab;
    const tabConfig = config.tabs?.[tab];
    const skipSlug = tabConfig?.['skip-slug'] || false;
    const tabSlug = skipSlug ? '' : tab;
    const tabDisplayName = tabConfig?.['display-name'] || tab;

    // Process each layout item as a section
    for (const layoutItem of navItem.layout) {
      // Determine section name
      let sectionName: string;
      if (tab === 'docs' && layoutItem.section) {
        sectionName = layoutItem.section;
      } else if (layoutItem.section) {
        sectionName = tabDisplayName; // Use tab name for non-docs sections
      } else {
        sectionName = tabDisplayName;
      }

      const sectionEntries: LlmsEntry[] = [];

      // Process direct pages
      if (layoutItem.page && layoutItem.path && layoutItem.slug) {
        const entry = processItem(layoutItem, tabSlug);
        if (entry) {
          sectionEntries.push(entry);
        }
      }

      // Process section contents
      if (layoutItem.contents) {
        const entries = processContentItems(
          layoutItem.contents,
          tabSlug,
          layoutItem.slug,
          undefined // Don't pass parentSection for top-level section items
        );
        sectionEntries.push(...entries);
      }

      if (sectionEntries.length > 0) {
        // Find existing section or add new one
        const existingIndex = sections.findIndex(([name]) => name === sectionName);
        if (existingIndex >= 0) {
          sections[existingIndex][1].push(...sectionEntries);
        } else {
          sections.push([sectionName, sectionEntries]);
        }
      }
    }
  }

  return sections;
}

// Generate llms.txt content following best practices
function generateLlmsTxt(sections: Array<[string, LlmsEntry[]]>): string {
  let content = '# Composio\n\n';
  content += '> Composio is a platform that connects AI agents to 500+ external tools and services through managed authentication, tool execution, and triggers. It simplifies integrating AI agents with SaaS applications, developer tools, and custom APIs.\n\n';
  content += 'Composio provides managed OAuth and API key authentication, tool execution across multiple AI frameworks (OpenAI, Anthropic, LangChain, CrewAI, etc.), MCP server support, and webhooks/triggers for real-time agent actions.\n\n';

  // Process all sections
  for (const [sectionName, entries] of sections) {
    content += `## ${sectionName}\n`;
    
    // Special handling for Toolkits section only
    if (sectionName === 'Toolkits') {
      content += `- [Tools JSON](https://docs.composio.dev/robots-only/tools.json): Machine-readable JSON with all 700+ toolkit slugs, descriptions, and tool names\n`;
    } else {
      for (const entry of entries) {
        // Add parent section prefix if it exists
        const displayTitle = entry.parentSection 
          ? `${entry.parentSection}: ${entry.title}`
          : entry.title;
        
        if (entry.description) {
          content += `- [${displayTitle}](${entry.url}): ${entry.description}\n`;
        } else {
          content += `- [${displayTitle}](${entry.url})\n`;
        }
      }
    }
    content += '\n';
  }

  return content;
}

// Main function
async function main(): Promise<void> {
  console.log('🔨 Building llms.txt from docs.yml...');

  try {
    // Load docs configuration
    const config = loadDocsConfig();
    
    // Process navigation to extract all entries
    const sections = processNavigation(config);
    
    // Count total entries
    let totalEntries = 0;
    for (const [, entries] of sections) {
      totalEntries += entries.length;
    }
    
    console.log(`📄 Found ${totalEntries} documentation pages`);

    // Generate llms.txt content
    const llmsTxtContent = generateLlmsTxt(sections);

    // Write llms.txt
    ensureOutputDir(LLMS_TXT_PATH);
    fs.writeFileSync(LLMS_TXT_PATH, llmsTxtContent);
    
    console.log(`✅ Generated llms.txt at ${LLMS_TXT_PATH}`);
  } catch (error) {
    console.error('❌ Error building llms.txt:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});