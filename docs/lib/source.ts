import { docs, reference, examples, toolkits, changelog } from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapi } from './openapi';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';

/**
 * Transformer to set defaultOpen: true for specific folders in the reference sidebar.
 * This is needed because openapiSource doesn't support meta.json files.
 */
const defaultOpenTransformer = {
  folder(node: { name: string; defaultOpen?: boolean }, folderPath: string) {
    // Set defaultOpen for API Reference and SDK Reference folders
    if (folderPath === 'api-reference' || folderPath === 'sdk-reference') {
      return { ...node, defaultOpen: true };
    }
    return node;
  },
};

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

// Combined reference source with MDX pages and OpenAPI-generated pages
// Lazy initialization to avoid top-level await issues in serverless
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _referenceSource: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _openapiPagesPromise: Promise<any> | null = null;

async function getOpenapiPages() {
  if (!_openapiPagesPromise) {
    _openapiPagesPromise = openapiSource(openapi, {
      groupBy: 'tag',
      baseDir: 'api-reference',
    });
  }
  return _openapiPagesPromise;
}

export async function getReferenceSource() {
  if (!_referenceSource) {
    const openapiPages = await getOpenapiPages();
    _referenceSource = loader({
      baseUrl: '/reference',
      source: multiple({
        mdx: reference.toFumadocsSource(),
        openapi: openapiPages,
      }),
      plugins: [lucideIconsPlugin(), openapiPlugin()],
      pageTree: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transformers: [defaultOpenTransformer as any],
      },
    });
  }
  return _referenceSource;
}

// Synchronous reference source for cases where OpenAPI isn't needed
export const referenceSource = loader({
  baseUrl: '/reference',
  source: reference.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const examplesSource = loader({
  baseUrl: '/examples',
  source: examples.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const toolkitsSource = loader({
  baseUrl: '/toolkits',
  source: toolkits.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const changelogEntries = changelog;

/**
 * Generate OG image URL for any page section
 */
export function getOgImageUrl(_section: string, _slugs: string[], title?: string, _description?: string): string {
  const encodedTitle = encodeURIComponent(title ?? 'Composio Docs');
  return `https://og.composio.dev/api/og?title=${encodedTitle}`;
}

/**
 * Converts MDX content to clean markdown for AI agents.
 * Strips JSX components and converts them to plain text equivalents.
 */
export function mdxToCleanMarkdown(content: string): string {
  let result = content;

  // Remove frontmatter
  result = result.replace(/^---[\s\S]*?---\n*/m, '');

  // Convert YouTube to link
  result = result.replace(
    /<YouTube\s+id="([^"]+)"\s+title="([^"]+)"\s*\/>/g,
    '[Video: $2](https://youtube.com/watch?v=$1)'
  );

  // Convert Callout to blockquote - trim content to avoid empty lines
  result = result.replace(
    /<Callout[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/Callout>/g,
    (_, title, content) => `> **${title}**: ${content.trim()}`
  );
  result = result.replace(
    /<Callout[^>]*>([\s\S]*?)<\/Callout>/g,
    (_, content) => `> ${content.trim()}`
  );

  // Convert Card - handle multiline and various attribute orders
  // Self-closing Cards with description attribute
  result = result.replace(
    /<Card[\s\S]*?title="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?\/>/g,
    '- [$1]($2): $3'
  );
  // Cards with children content (non-self-closing)
  result = result.replace(
    /<Card[\s\S]*?title="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Card>/g,
    '- [$1]($2): $3'
  );
  // Cards with href before title
  result = result.replace(
    /<Card[\s\S]*?href="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Card>/g,
    '- [$2]($1): $3'
  );

  // Convert ProviderCard to markdown link
  result = result.replace(
    /<ProviderCard[\s\S]*?name="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?languages=\{\[([^\]]*)\]\}[\s\S]*?\/>/g,
    (_, name, href, langs) => `- [${name}](${href}) (${langs.replace(/"/g, '')})`
  );

  // Convert Tabs/Tab content - keep inner content
  result = result.replace(/<TabsList>[\s\S]*?<\/TabsList>/g, '');
  result = result.replace(/<TabsTrigger[^>]*>[^<]*<\/TabsTrigger>/g, '');
  result = result.replace(/<TabsContent[\s\S]*?value="([^"]*)"[\s\S]*?>([\s\S]*?)<\/TabsContent>/g, '\n**$1:**\n$2');
  result = result.replace(/<Tab[\s\S]*?value="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Tab>/g, '\n**$1:**\n$2');

  // Convert Steps/Step with StepTitle
  // Handle StepTitle with potential whitespace and multiline content
  result = result.replace(/<StepTitle>([\s\S]*?)<\/StepTitle>/g, (_, title) => {
    // Clean up the title - remove extra whitespace and any # prefix fumadocs might add
    const cleanTitle = title.replace(/^[\s#]*#\s*/, '').replace(/\s+$/, '').trim();
    return cleanTitle ? `#### ${cleanTitle}` : '';
  });
  // Handle <Step> with ### header pattern (legacy)
  result = result.replace(/<Step>\s*###\s*(.+)/g, '#### $1');
  // Remove Steps wrapper and Step tags
  result = result.replace(/<\/?Steps>/g, '');
  result = result.replace(/<\/?Step>/g, '');
  // Clean up step titles that fumadocs converted to "# title" format
  // These appear as "#### # Title" after our processing, fix to "#### Title"
  result = result.replace(/^(\s*#{1,6})\s*#\s+(.+)$/gm, '$1 $2');
  // Clean up any standalone # that fumadocs might leave
  result = result.replace(/^\s*#\s*$/gm, '');

  // Convert FrameworkOption to header with framework name
  result = result.replace(
    /<FrameworkOption[\s\S]*?name="([^"]*)"[\s\S]*?>/g,
    '\n## $1\n'
  );
  result = result.replace(/<\/FrameworkOption>/g, '');

  // Convert IntegrationContent to labeled section (Native Tools / MCP)
  result = result.replace(
    /<IntegrationContent[\s\S]*?value="([^"]*)"[\s\S]*?>/g,
    (_, value) => `\n### ${value === 'native' ? 'Native Tools' : 'MCP'}\n`
  );
  result = result.replace(/<\/IntegrationContent>/g, '');

  // Convert Accordion to collapsible-style text
  result = result.replace(
    /<Accordion[\s\S]*?title="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Accordion>/g,
    '\n**$1**\n$2'
  );

  // Convert Figure to markdown image with caption
  result = result.replace(
    /<Figure[\s\S]*?src="([^"]*)"[\s\S]*?alt="([^"]*)"[\s\S]*?caption="([^"]*)"[\s\S]*?\/>/g,
    '![$2]($1)\n*$3*'
  );
  // Figure without caption
  result = result.replace(
    /<Figure[\s\S]*?src="([^"]*)"[\s\S]*?alt="([^"]*)"[\s\S]*?\/>/g,
    '![$2]($1)'
  );

  // Convert ToolTypeOption to labeled section (similar to IntegrationContent)
  result = result.replace(
    /<ToolTypeOption[\s\S]*?name="([^"]*)"[\s\S]*?>/g,
    '\n### $1\n'
  );
  result = result.replace(/<\/ToolTypeOption>/g, '');

  // Remove wrapper components (Cards, ProviderGrid, Tabs, Frame, div, QuickstartFlow, IntegrationTabs, Accordions, ToolTypeFlow, ToolkitsLanding, etc.)
  result = result.replace(/<\/?(Cards|ProviderGrid|Tabs|Frame|div|QuickstartFlow|IntegrationTabs|Accordions|ToolTypeFlow|ToolkitsLanding)[^>]*>/g, '');

  // Remove remaining self-closing JSX tags (including those with JSX expressions)
  result = result.replace(/<[A-Z][a-zA-Z]*[\s\S]*?\/>/g, '');

  // Remove remaining JSX opening/closing tags but keep content
  result = result.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Clean up leftover JSX artifacts like lone } or {
  result = result.replace(/^\s*[{}]\s*$/gm, '');

  // Normalize indentation while preserving markdown structure
  // - Code blocks: normalize by stripping common indentation prefix
  // - Nested lists/blockquotes: preserve relative indentation
  // - Other content: remove excessive leading whitespace from JSX nesting
  const lines = result.split('\n');
  const normalizedLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      // Find minimum indentation (ignoring empty lines)
      const nonEmptyLines = codeBlockLines.filter(l => l.trim().length > 0);
      const minIndent = nonEmptyLines.length > 0
        ? Math.min(...nonEmptyLines.map(l => l.match(/^(\s*)/)?.[1]?.length || 0))
        : 0;
      // Strip common indentation
      for (const codeLine of codeBlockLines) {
        normalizedLines.push(codeLine.slice(minIndent));
      }
      codeBlockLines = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block - normalize and flush
        flushCodeBlock();
        inCodeBlock = false;
        normalizedLines.push(line.trim());
      } else {
        // Start of code block
        inCodeBlock = true;
        normalizedLines.push(line.trim());
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    } else {
      // Outside code blocks - smart whitespace handling
      const trimmedLine = line.trimStart();
      // Preserve indentation for markdown list items (but not blockquotes at root level)
      if (trimmedLine.match(/^[-*+]\s/) || trimmedLine.match(/^\d+\.\s/)) {
        // For list items, normalize to 2-space indentation levels
        const leadingSpaces = line.length - trimmedLine.length;
        const indentLevel = Math.floor(leadingSpaces / 2);
        const normalizedIndent = '  '.repeat(Math.min(indentLevel, 4)); // Cap at 4 levels
        normalizedLines.push(normalizedIndent + trimmedLine);
      } else {
        // For other content (including blockquotes), remove excessive leading whitespace
        normalizedLines.push(trimmedLine);
      }
    }
  }

  // Handle unclosed code block - flush any remaining content
  if (inCodeBlock) {
    flushCodeBlock();
  }

  result = normalizedLines.join('\n');

  // Clean up excessive newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

export async function getLLMText(page: InferPageType<typeof source>) {
  // Fall back to description if getText is not available
  if (typeof page.data.getText !== 'function') {
    return `# ${page.data.title} (${page.url})

${page.data.description || ''}`;
  }

  // Try 'processed' mode first (works in serverless), then 'raw' (works locally)
  // Both can fail in different environments, so handle gracefully
  let content: string | null = null;

  try {
    content = await page.data.getText('processed');
  } catch (e) {
    console.error('getText(processed) failed:', e);
    try {
      content = await page.data.getText('raw');
    } catch (e2) {
      console.error('getText(raw) also failed:', e2);
    }
  }

  if (!content) {
    return `# ${page.data.title} (${page.url})

${page.data.description || ''}`;
  }

  const cleanContent = mdxToCleanMarkdown(content);

  return `# ${page.data.title} (${page.url})

${cleanContent}`;
}

export function formatDate(dateStr: string): string {
  // Add T12:00 to avoid UTC midnight timezone shift
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateDateFormat(dateStr: string): void {
  if (!DATE_REGEX.test(dateStr)) {
    throw new Error(
      `Invalid date format: "${dateStr}". Expected YYYY-MM-DD (e.g., "2025-12-29")`
    );
  }
}

export function dateToChangelogUrl(dateStr: string): string {
  // Convert "2025-12-29" to "/docs/changelog/2025/12/29"
  validateDateFormat(dateStr);
  const [year, month, day] = dateStr.split('-');
  return `/docs/changelog/${year}/${month}/${day}`;
}

export function dateToSlug(dateStr: string): string[] {
  // Convert "2025-12-29" to ["2025", "12", "29"]
  validateDateFormat(dateStr);
  const [year, month, day] = dateStr.split('-');
  return [year, month, day];
}

export function slugToDate(slug: string[]): string | null {
  // Convert ["2025", "12", "29"] to "2025-12-29"
  if (slug.length !== 3) return null;
  const [year, month, day] = slug;
  return `${year}-${month}-${day}`;
}
