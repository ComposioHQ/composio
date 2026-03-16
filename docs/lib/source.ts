import { docs, reference, cookbooks, toolkits, changelog } from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapi } from './openapi';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';
import { getGuardrails } from './llm-guardrails';

/**
 * Transformer to set defaultOpen: true for specific folders in the reference sidebar.
 * This is needed because openapiSource doesn't support meta.json files.
 */
const defaultOpenTransformer = {
  folder(node: { name: string; defaultOpen?: boolean }, folderPath: string) {
    // Set defaultOpen for API Reference and SDK Reference folders
    if (folderPath === 'api-reference' || folderPath === 'sdk-reference' || folderPath === 'meta-tools') {
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

export const cookbooksSource = loader({
  baseUrl: '/cookbooks',
  source: cookbooks.toFumadocsSource(),
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

  // Remove Cards wrapper before processing individual Card tags
  // (prevents <Cards> from being matched by <Card regex since <Cards starts with <Card)
  result = result.replace(/<\/?Cards\b[^>]*>/g, '');

  // Convert Card - handle multiline and various attribute orders
  // Self-closing Cards with description attribute
  result = result.replace(
    /<Card\b[\s\S]*?title="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?\/>/g,
    '- [$1]($2): $3'
  );
  // Cards with children content (non-self-closing)
  result = result.replace(
    /<Card\b[\s\S]*?title="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Card>/g,
    '- [$1]($2): $3'
  );
  // Cards with href before title
  result = result.replace(
    /<Card\b[\s\S]*?href="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Card>/g,
    '- [$2]($1): $3'
  );
  // Convert ProviderCard to markdown link
  result = result.replace(
    /<ProviderCard[\s\S]*?name="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?languages=\{\[([^\]]*)\]\}[\s\S]*?\/>/g,
    (_, name, href, langs) => `- [${name}](${href}) (${langs.replace(/"/g, '')})`
  );

  // Strip orphaned indentation from converted list items
  // (Cards/ProviderCards nested inside wrapper components had JSX indentation that persists after wrapper removal)
  result = result.replace(/^[ \t]+(- \[)/gm, '$1');

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

  // Convert IntegrationTabs — extract label from tabs prop if present
  const tabLabelMap: Record<string, string> = { native: 'Native Tools', mcp: 'MCP' };
  result = result.replace(
    /<IntegrationTabs[\s\S]*?tabs=\{\[([\s\S]*?)\]\}[\s\S]*?>/g,
    (_, tabsContent: string) => {
      const labelRegex = /value:\s*"([^"]+)"[\s\S]*?label:\s*"([^"]+)"/g;
      let match;
      while ((match = labelRegex.exec(tabsContent)) !== null) {
        tabLabelMap[match[1]] = match[2];
      }
      return '\n> Choose your integration type · [Use this guide to decide](/docs/native-tools-vs-mcp)\n';
    }
  );
  // Also handle IntegrationTabs without explicit tabs prop
  result = result.replace(
    /<IntegrationTabs(?![^>]*tabs=)[\s\S]*?>/g,
    '\n> Choose your integration type · [Use this guide to decide](/docs/native-tools-vs-mcp)\n'
  );

  // Convert IntegrationContent to labeled section
  result = result.replace(
    /<IntegrationContent[\s\S]*?value="([^"]*)"[\s\S]*?>/g,
    (_, value: string) => `\n### ${tabLabelMap[value] || value}\n`
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

  // Convert TemplateCard to markdown link with description
  result = result.replace(
    /<TemplateCard[\s\S]*?title="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?\/>/g,
    '- [$1]($3): $2'
  );
  // TemplateCard with href before title
  result = result.replace(
    /<TemplateCard[\s\S]*?href="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?\/>/g,
    '- [$2]($1): $3'
  );

  // Convert GlossaryTerm to heading + definition
  result = result.replace(
    /<GlossaryTerm[\s\S]*?name="([^"]*)"[\s\S]*?>([\s\S]*?)<\/GlossaryTerm>/g,
    (_, name, content) => `### ${name}\n\n${content.trim()}`
  );

  // Strip PromptBanner and its children (UI-only copy-prompt widget)
  result = result.replace(/<PromptBanner[\s\S]*?<\/PromptBanner>/g, '');

  // Convert AIToolsBanner to plain text
  result = result.replace(
    /<AIToolsBanner\s*\/>/g,
    '### For AI tools\n\n' +
    '**Skills:**\n' +
    '```bash\nnpx skills add composiohq/skills\n```\n' +
    '[Skills.sh](https://skills.sh/composiohq/skills/composio) · [GitHub](https://github.com/composiohq/skills)\n\n' +
    '**CLI:**\n' +
    '```bash\ncurl -fsSL https://composio.dev/install | bash\n```\n' +
    '[CLI Reference](/docs/cli)\n\n' +
    '**Context:**\n' +
    '- [llms.txt](/llms.txt) — Documentation index with links\n' +
    '- [llms-full.txt](/llms-full.txt) — Complete documentation in one file'
  );

  // Convert ConnectClientOption opening tags to headings for LLM output
  result = result.replace(
    /<ConnectClientOption[^>]*\bname="([^"]*)"[^>]*>/g,
    (_, name) => `## ${name}\n`
  );

  // Remove wrapper components (ProviderGrid, Tabs, Frame, div, QuickstartFlow, IntegrationTabs, Accordions, ToolTypeFlow, ToolkitsLanding, TemplateGrid, etc.)
  // Note: Cards wrapper is removed earlier (before Card conversion) to prevent regex conflicts
  result = result.replace(/<\/?(ProviderGrid|Tabs|Frame|div|QuickstartFlow|IntegrationTabs|Accordions|ToolTypeFlow|ToolkitsLanding|TemplateGrid|Glossary|ConnectFlow|ConnectClientOption)[^>]*>/g, '');

  // Remove remaining self-closing JSX tags (including those with JSX expressions)
  result = result.replace(/<[A-Z][a-zA-Z]*[\s\S]*?\/>/g, '');

  // Remove remaining JSX opening/closing tags but keep content
  result = result.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Note: lone brace cleanup is done inside the code-block-aware loop below
  // to avoid stripping { and } from JSON code blocks.

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
      // Clean up leftover JSX artifacts like lone } or { (only outside code blocks)
      if (/^\s*[{}]\s*$/.test(line)) {
        continue;
      }
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

  // Strip twoslash annotations ONLY inside code blocks (used for type-checking, not useful for AI)
  // These include: // ---cut---, // @errors, // ^?, // @noErrors, etc.
  result = stripTwoslashFromCodeBlocks(result);

  return result.trim();
}

/**
 * Strip twoslash annotations only from inside code blocks.
 * This ensures we don't accidentally modify prose content.
 */
function stripTwoslashFromCodeBlocks(content: string): string {
  // Match code blocks: ```lang ... ```
  return content.replace(/(```[\w]*\n)([\s\S]*?)(```)/g, (match, open, code, close) => {
    let cleanCode = code;
    // Remove twoslash directives
    cleanCode = cleanCode.replace(/^\/\/\s*---cut---.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@errors?:.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@noErrors.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@filename:.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@highlight.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*\^[\?\!].*\n?/gm, ''); // ^? and ^! hover annotations
    // Clean up resulting empty lines at start of code block
    cleanCode = cleanCode.replace(/^\n+/, '');
    return open + cleanCode + close;
  });
}

export async function getLLMText(page: InferPageType<typeof source>, options?: { includeFooter?: boolean; includeGuardrails?: boolean }) {
  const includeFooter = options?.includeFooter ?? true;
  const includeGuardrails = options?.includeGuardrails ?? true;
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

  // Split content at Mermaid tags, process each segment separately, then rejoin
  // with mermaid code blocks. This prevents JSX regexes with [\s\S]*? from
  // matching across mermaid boundaries and consuming diagram content.
  const mermaidRegex = /<Mermaid\s+chart="([\s\S]*?)"\s*\/>/g;
  const segments: string[] = [];
  const mermaidCharts: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mermaidRegex.exec(content)) !== null) {
    segments.push(content.slice(lastIndex, match.index));
    mermaidCharts.push(match[1]);
    lastIndex = match.index + match[0].length;
  }
  segments.push(content.slice(lastIndex));

  const cleanSegments = segments.map(s => mdxToCleanMarkdown(s));
  let cleanContent = cleanSegments[0];
  for (let i = 0; i < mermaidCharts.length; i++) {
    // Decode HTML entities that fumadocs encodes in JSX attributes
    const chart = mermaidCharts[i].replace(/&#x22;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    cleanContent += `\n\n\`\`\`mermaid\n${chart}\n\`\`\`\n\n${cleanSegments[i + 1]}`;
  }

  const footer = includeFooter
    ? `\n\n---\n\n📚 **More documentation:** [View all docs](https://docs.composio.dev/llms.txt) | [Glossary](https://docs.composio.dev/llms.mdx/docs/glossary) | [Cookbooks](https://docs.composio.dev/llms.mdx/cookbooks) | [API Reference](https://docs.composio.dev/llms.mdx/reference)`
    : '';

  const guardrails = includeGuardrails ? getGuardrails(page.data.llmGuardrails) : '';

  return `# ${page.data.title} (${page.url})

${cleanContent}${footer}${guardrails}`;
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
