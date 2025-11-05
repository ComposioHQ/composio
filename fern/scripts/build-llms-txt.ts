#!/usr/bin/env bun
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { watch } from 'fs';

// Define directories
const FERN_DIR = path.join(import.meta.dir, '..');
const DOCS_YML_PATH = path.join(FERN_DIR, 'docs.yml');
const LLMS_TXT_PATH = path.join(FERN_DIR, 'llms-txt-worker', 'public', 'llms.txt');
const TOOLS_JSON_PATH = path.join(
  FERN_DIR,
  'llms-txt-worker',
  'public',
  'robots-only',
  'tools.json'
);
const PAGES_DIR = path.join(FERN_DIR, 'pages');
const TOOLKITS_DIR = path.join(FERN_DIR, 'toolkits');

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
}

interface ToolkitInfo {
  slug: string;
  description: string;
  tools: string[];
}

interface ToolsData {
  toolkitNames: string[];
  [key: string]: string[] | ToolkitInfo;
}

// Parse tool MDX files to extract toolkit information
function parseToolMdx(toolMdxPath: string): ToolkitInfo | null {
  try {
    const fullPath = path.join(TOOLKITS_DIR, toolMdxPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Tool file not found: ${fullPath}`);
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.warn(`⚠️  No frontmatter found in: ${toolMdxPath}`);
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
    if (!titleMatch) {
      console.warn(`⚠️  No title found in: ${toolMdxPath}`);
      return null;
    }

    // Extract SLUG from content
    const slugMatch = content.match(/\*\*SLUG\*\*:\s*`([^`]+)`/);
    if (!slugMatch) {
      console.warn(`⚠️  No SLUG found in: ${toolMdxPath}`);
      return null;
    }

    // Extract description
    const descriptionMatch = content.match(/### Description\s*\n(.+?)(?:\n|$)/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';

    // Extract tool names from Accordion titles
    const toolNames: string[] = [];
    const accordionMatches = content.matchAll(/<Accordion title="([^"]+)">/g);

    for (const match of accordionMatches) {
      const toolName = match[1];
      // Only include tools that start with the toolkit prefix
      if (toolName.startsWith(slugMatch[1] + '_')) {
        toolNames.push(toolName);
      }
    }

    return {
      slug: slugMatch[1],
      description,
      tools: toolNames,
    };
  } catch (error) {
    console.warn(`⚠️  Error parsing tool file ${toolMdxPath}:`, error);
    return null;
  }
}

// Extract description from MDX content
function extractDescription(mdxPath: string): string | undefined {
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

// Process content items recursively
function processContentItems(
  items: ContentItem[],
  tabSlug: string,
  entries: LlmsEntry[],
  toolsData: ToolsData,
  parentSlug?: string
): void {
  for (const item of items) {
    if (item.page && item.path) {
      // Check if this is a tool page (in toolkits/ directory) with a SLUG
      if (item.path.includes('toolkits/') && item.path.endsWith('.mdx')) {
        // Parse tool MDX file and check if it has a SLUG (actual tool page)
        const toolMdxFile = item.path.match(/toolkits\/(.+\.mdx)$/)?.[1];
        if (toolMdxFile) {
          const toolkitInfo = parseToolMdx(toolMdxFile);
          if (toolkitInfo) {
            // This is an actual tool page with SLUG - add to toolsData and skip main entries
            toolsData.toolkitNames.push(toolkitInfo.slug);
            toolsData[toolkitInfo.slug] = toolkitInfo;
            continue;
          }
          // If no SLUG found, it's a documentation page in toolkits/ - include in main entries
        }
      }

      let url: string;

      if (item.slug) {
        // Use explicit slug if provided
        const slugParts = [tabSlug, item.slug].filter(Boolean);
        url = `https://docs.composio.dev/${slugParts.join('/')}`;
        // Add .mdx extension if not already present
        if (!url.endsWith('.mdx') && !url.endsWith('.md')) {
          url = url + '.mdx';
        }
      } else if (item.path) {
        // For SDK reference pages without explicit slugs, construct from path
        const pathMatch = item.path.match(/pages\/dist\/(.+)$/);
        if (pathMatch) {
          let constructedPath = pathMatch[1];
          // Handle sdk-reference special case
          if (tabSlug === 'sdk-reference' && constructedPath.startsWith('sdk/')) {
            constructedPath = constructedPath.replace('sdk/', 'sdk-reference/');
            // Convert typescript to type-script
            constructedPath = constructedPath.replace('typescript/', 'type-script/');
          }
          url = `https://docs.composio.dev/${constructedPath}`;
        } else {
          // Fallback
          const slugParts = [tabSlug, parentSlug].filter(Boolean);
          url = `https://docs.composio.dev/${slugParts.join('/')}/${item.page.toLowerCase().replace(/\s+/g, '-')}.mdx`;
        }
      } else {
        // Fallback
        const slugParts = [tabSlug, parentSlug].filter(Boolean);
        url = `https://docs.composio.dev/${slugParts.join('/')}/${item.page.toLowerCase().replace(/\s+/g, '-')}.mdx`;
      }

      const description = extractDescription(item.path);

      // Override specific page titles
      let title = item.page;
      if (title === 'Overview' && url.includes('mcp-overview')) {
        title = 'Composio MCP Servers';
      }

      entries.push({
        title: title,
        url: url,
        description,
      });
    }

    // Process nested sections
    if (item.section && item.contents) {
      const newParentSlug = item.slug || parentSlug;
      processContentItems(item.contents, tabSlug, entries, toolsData, newParentSlug);
    }
  }
}

// Process navigation items
function processNavigation(config: DocsConfig): { entries: LlmsEntry[]; toolsData: ToolsData } {
  const entries: LlmsEntry[] = [];
  const toolsData: ToolsData = { toolkitNames: [] };

  for (const navItem of config.navigation) {
    if (!navItem.layout) continue;

    const tab = navItem.tab;
    const tabConfig = config.tabs?.[tab];
    const skipSlug = tabConfig?.['skip-slug'] || false;
    const tabSlug = skipSlug ? '' : tab;

    for (const layoutItem of navItem.layout) {
      // Process direct pages
      if (layoutItem.page && layoutItem.path && layoutItem.slug) {
        const slugParts = [tabSlug, layoutItem.slug].filter(Boolean);
        const url = `https://docs.composio.dev/${slugParts.join('/')}`;
        const description = extractDescription(layoutItem.path);

        entries.push({
          title: layoutItem.page,
          url: url.endsWith('.mdx') || url.endsWith('.md') ? url : url + '.mdx',
          description,
        });
      }

      // Process section contents
      if (layoutItem.section && layoutItem.contents) {
        processContentItems(layoutItem.contents, tabSlug, entries, toolsData, layoutItem.slug);
      }
    }
  }

  return { entries, toolsData };
}

// Generate llms.txt content
function generateLlmsTxt(entries: LlmsEntry[], toolkitCount: number): string {
  let content = '# Composio Docs\n\n## Docs\n\n';

  for (const entry of entries) {
    if (entry.description) {
      content += `- [${entry.title}](${entry.url}): ${entry.description}\n`;
    } else {
      content += `- [${entry.title}](${entry.url})\n`;
    }
  }

  // Add reference to tools JSON
  content += `\n## Complete list of composio tools\n\n`;
  content += `- [Tools JSON](https://docs.composio.dev/robots-only/tools.json): Complete JSON list of all ${toolkitCount} toolkits with their tools and descriptions\n`;

  return content;
}

// Main build function
async function buildLlmsTxt(): Promise<void> {
  console.log('🔨 Building llms.txt from docs.yml...');

  try {
    // Read and parse docs.yml
    const docsYmlContent = fs.readFileSync(DOCS_YML_PATH, 'utf8');
    const config = yaml.parse(docsYmlContent) as DocsConfig;

    // Process navigation to extract all entries
    const { entries, toolsData } = processNavigation(config);
    console.log(`📄 Found ${entries.length} documentation pages`);

    // Generate llms.txt content
    const llmsTxtContent = generateLlmsTxt(entries, toolsData.toolkitNames.length);

    // Ensure output directory exists
    const outputDir = path.dirname(LLMS_TXT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write llms.txt
    fs.writeFileSync(LLMS_TXT_PATH, llmsTxtContent);
    console.log(`✅ Generated llms.txt at ${path.relative(FERN_DIR, LLMS_TXT_PATH)}`);

    // Write tools.json
    const toolsDir = path.dirname(TOOLS_JSON_PATH);
    if (!fs.existsSync(toolsDir)) {
      fs.mkdirSync(toolsDir, { recursive: true });
    }
    const toolsJsonContent = JSON.stringify(toolsData, null, 2);
    fs.writeFileSync(TOOLS_JSON_PATH, toolsJsonContent);
    console.log(
      `✅ Generated tools.json at ${path.relative(FERN_DIR, TOOLS_JSON_PATH)} with ${toolsData.toolkitNames.length} toolkits`
    );
  } catch (error) {
    console.error('❌ Error building llms.txt:', error);
    process.exit(1);
  }
}

// Watch mode
function startWatchMode(): void {
  console.log('👀 Watching for changes...');

  // Watch docs.yml
  const docsWatcher = watch(DOCS_YML_PATH, async eventType => {
    if (eventType === 'change') {
      console.log('🔄 docs.yml changed, rebuilding...');
      await buildLlmsTxt();
    }
  });

  // Watch MDX files in pages directory
  const pagesWatcher = watch(PAGES_DIR, { recursive: true }, async (eventType, filename) => {
    if (filename && (filename.endsWith('.mdx') || filename.endsWith('.md'))) {
      console.log(`🔄 Page changed: ${filename}, rebuilding...`);
      await buildLlmsTxt();
    }
  });

  // Watch MDX files in toolkits directory
  const toolkitsWatcher = watch(TOOLKITS_DIR, { recursive: true }, async (eventType, filename) => {
    if (filename && (filename.endsWith('.mdx') || filename.endsWith('.md'))) {
      console.log(`🔄 Toolkit doc changed: ${filename}, rebuilding...`);
      await buildLlmsTxt();
    }
  });

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping watchers...');
    docsWatcher.close();
    pagesWatcher.close();
    toolkitsWatcher.close();
    process.exit(0);
  });
}

// Main function
async function main(): Promise<void> {
  await buildLlmsTxt();

  // Check if we should run in watch mode
  const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');

  if (isWatchMode) {
    startWatchMode();
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
