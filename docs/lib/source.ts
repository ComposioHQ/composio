import { docs, reference, examples, toolkits, changelog } from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapi } from './openapi';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

// Combined reference source with MDX pages and OpenAPI-generated pages
const openapiPages = await openapiSource(openapi, {
  groupBy: 'tag',
  baseDir: 'api-reference',
});

export const referenceSource = loader({
  baseUrl: '/reference',
  source: multiple({
    mdx: reference.toFumadocsSource(),
    openapi: openapiPages,
  }),
  plugins: [lucideIconsPlugin(), openapiPlugin()],
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

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/og/docs/${segments.join('/')}`,
  };
}

/**
 * Generate OG image URL for any page section
 */
export function getOgImageUrl(section: string, slugs: string[], title?: string, description?: string): string {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (description) params.set('description', description);
  const query = params.toString() ? `?${params.toString()}` : '';
  const slugPath = slugs.length > 0 ? `${slugs.join('/')}/` : '';
  return `/og/${section}/${slugPath}image.png${query}`;
}

/**
 * Converts MDX content to clean markdown for AI agents.
 * Strips JSX components and converts them to plain text equivalents.
 */
function mdxToCleanMarkdown(content: string): string {
  let result = content;

  // Remove frontmatter
  result = result.replace(/^---[\s\S]*?---\n*/m, '');

  // Convert YouTube to link
  result = result.replace(
    /<YouTube\s+id="([^"]+)"\s+title="([^"]+)"\s*\/>/g,
    '[Video: $2](https://youtube.com/watch?v=$1)'
  );

  // Convert Callout to blockquote
  result = result.replace(
    /<Callout[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/Callout>/g,
    '> **$1**: $2'
  );
  result = result.replace(
    /<Callout[^>]*>([\s\S]*?)<\/Callout>/g,
    '> $1'
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

  // Convert Steps/Step
  result = result.replace(/<Step>\s*###\s*(.+)/g, '### Step: $1');
  result = result.replace(/<\/?Steps?>/g, '');

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

  // Clean up excessive newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const content = await page.data.getText('raw');
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
