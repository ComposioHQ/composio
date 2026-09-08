import {
  docs,
  reference,
  examples,
  toolkits,
  knowledgeBase,
  changelog,
} from 'fumadocs-mdx:collections/server';
import type { DocCollectionEntry } from 'fumadocs-mdx/runtime/server';
import { type InferPageType, loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapi, openapiV3 } from './openapi';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';
import { getGuardrails } from './llm-guardrails';
import { isHiddenApiTagUrl } from './filter-api-version';
import { FILE_BUILDS } from './file-builds';
import { replaceRepoBrowserMarkdown } from './repo-browser-markdown';
import { transformDeprecatedApiSidebarNode } from './deprecated-api-sidebar';
import { API_BASE_URLS, detectApiVersion, type ApiVersion } from './api-version';
import { apiVersionPointer } from './api-version-guidance';
import { apiEndpointsSchema } from './api-endpoints-table-schema';
import { replaceHomeNavigationMarkdown } from './home-navigation';

/**
 * True if a reference URL belongs to an intentionally-hidden API tag
 * (consumer, invite-codes) in either v3.1 or v3.0. These tags exist in the
 * upstream OpenAPI spec but are hidden on our side. The page tree is filtered
 * via `prepareTree` (lib/filter-api-version.ts); this mirror keeps the flat
 * `getPages()` list (consumed by validate-links, llms.mdx, sitemap) in sync.
 */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

function loadOpenapiPages() {
  return Promise.all([
    openapiSource(openapi, { groupBy: 'tag', baseDir: 'api-reference' }),
    openapiSource(openapiV3, { groupBy: 'tag', baseDir: 'v3/api-reference' }),
  ]);
}

type OpenapiPages = Awaited<ReturnType<typeof loadOpenapiPages>>;

// One combined reference source with both v3.1 and v3.0 OpenAPI pages.
// v3.1 at api-reference/, v3.0 at api-reference/v3/
let _openapiPagesPromise: ReturnType<typeof loadOpenapiPages> | null = null;

async function getOpenapiPages() {
  if (!_openapiPagesPromise) {
    _openapiPagesPromise = loadOpenapiPages().catch(e => {
      // Don't permanently cache a failed load (e.g. a transient OpenAPI spec
      // resolution error in a serverless instance). Clearing the memo lets the
      // next request retry instead of re-throwing the same cached rejection.
      _openapiPagesPromise = null;
      throw e;
    });
  }
  return _openapiPagesPromise;
}

function createReferenceSource(openapiLatest: OpenapiPages[0], openapiV3Pages: OpenapiPages[1]) {
  const loaded = loader({
    baseUrl: '/reference',
    source: multiple({
      mdx: reference.toFumadocsSource(),
      openapi: openapiLatest,
      'openapi-v3': openapiV3Pages,
    }),
    plugins: [lucideIconsPlugin(), openapiPlugin()],
    pageTree: {
      transformers: [
        {
          folder(node, folderPath) {
            if (
              folderPath === 'api-reference' ||
              folderPath === 'sdk-reference' ||
              folderPath === 'v3/api-reference'
            ) {
              return { ...node, defaultOpen: true };
            }
            return node;
          },
        },
        {
          file(node, filePath) {
            return transformDeprecatedApiSidebarNode(node, filePath, this.storage);
          },
        },
      ],
    },
  });

  // Exclude intentionally-hidden API tags (consumer, invite-codes) from the
  // flat page list so validate-links, llms.mdx, llms.txt, and sitemap skip
  // their fumadocs-openapi operation pages. The sidebar tree is filtered
  // separately via prepareTree (lib/filter-api-version.ts).
  const originalGetPages = loaded.getPages.bind(loaded);
  loaded.getPages = (...args: Parameters<typeof originalGetPages>) =>
    originalGetPages(...args).filter((page: { url: string }) => !isHiddenApiTagUrl(page.url));

  return loaded;
}

type ReferenceSource = ReturnType<typeof createReferenceSource>;
let _referenceSource: ReferenceSource | null = null;

export async function getReferenceSource() {
  if (!_referenceSource) {
    const [openapiLatest, openapiV3Pages] = await getOpenapiPages();
    _referenceSource = createReferenceSource(openapiLatest, openapiV3Pages);
  }
  return _referenceSource;
}

// Synchronous reference source for cases where OpenAPI isn't needed
export const referenceSource = loader({
  baseUrl: '/reference',
  source: reference.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export type ReferenceMdxPageData = InferPageType<typeof referenceSource>['data'];

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

export const knowledgeBaseSource = loader({
  baseUrl: '/kb',
  source: knowledgeBase.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export type ChangelogEntry = DocCollectionEntry<
  'changelog',
  {
    date: string;
    title: string;
    description?: string;
    icon?: string;
    full?: boolean;
  }
>;

// The generated Fumadocs virtual module is untyped in Next's production
// checker. Preserve the collection's public shape for all route consumers.
export const changelogEntries = changelog as ChangelogEntry[];

export function getOgImageUrl(
  _section: string,
  _slugs: string[],
  title?: string,
  _description?: string
): string {
  const encodedTitle = encodeURIComponent(title ?? 'Composio Docs');
  return `https://og.composio.dev/api/og?title=${encodedTitle}`;
}

/**
 * `<ApiEndpointsTable />` reaches this converter in two different shapes.
 *
 * `getLLMText` reads fumadocs' *processed* markdown, which re-serializes the
 * JSX expression attribute as a quoted string with the inner quotes escaped:
 *
 *   <ApiEndpointsTable endpoints="[{&#x22;method&#x22;:&#x22;GET&#x22;, ...}]" />
 *
 * while `lib/search-index.ts` passes the raw file content, which keeps the
 * authored form:
 *
 *   <ApiEndpointsTable endpoints={[{"method":"GET", ...}]} />
 *
 * Matching only the authored form is what left the Endpoints section empty on
 * every live tag page, so both are matched here. Braces are not escaped in the
 * processed form, and every inner `"` is — so a non-greedy match to the next
 * unescaped quote is exact.
 */
const API_ENDPOINTS_TABLE_REGEX =
  /<ApiEndpointsTable\s+endpoints=(?:\{([\s\S]*?)\}\s*\/>|"([\s\S]*?)"\s*\/>)/g;

/** Reverses the entity escaping fumadocs applies to JSX attribute values. */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Renders an `<ApiEndpointsTable />` payload as a markdown table.
 *
 * Degrades rather than throws: a malformed payload emits nothing for that one
 * table and warns, because taking the whole `.md` response down over one bad
 * page is worse. The failure signal for checked-in content lives in the static
 * suite instead — `tests/static/api-reference-routes.test.ts` runs every
 * committed payload through the same schema, and
 * `scripts/generate-api-index.ts` refuses to write an invalid one.
 */
function endpointsTableToMarkdown(payload: string, version: ApiVersion, url?: string): string {
  const where = url ?? '(no page url)';

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    console.warn(`[mdxToCleanMarkdown] unparseable ApiEndpointsTable payload on ${where}`);
    return '';
  }

  const parsed = apiEndpointsSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`[mdxToCleanMarkdown] invalid ApiEndpointsTable payload on ${where}`);
    return '';
  }

  const rows = parsed.data.map(endpoint => {
    const path = version === '3.0' ? endpoint.pathV3 : endpoint.pathV31;
    const summary = endpoint.summary
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
    const label = endpoint.legacy ? `${summary} (Legacy)` : summary;
    return `| \`${endpoint.method}\` | \`${path}\` | [${label}](${endpoint.href}) |`;
  });

  return ['| Method | Path | Endpoint |', '| --- | --- | --- |', ...rows].join('\n');
}

/**
 * Converts MDX content to clean markdown for AI agents.
 * Strips JSX components and converts them to plain text equivalents.
 *
 * `url` is the page URL. `ApiBaseUrl` and `ApiEndpointsTable` are client
 * components that pick a version from `usePathname()`, which the `.md` channel
 * has no access to — so the URL is passed in and resolved with the same
 * `detectApiVersion`. Optional because the changelog call sites have no page
 * URL; with none, the page is treated as current (v3.1), which is correct
 * there since the changelog tree is not versioned.
 */
export function mdxToCleanMarkdown(content: string, url?: string): string {
  let result = content;
  const version = url ? detectApiVersion(url) : '3.1';

  // Remove frontmatter
  result = result.replace(/^---[\s\S]*?---\n*/m, '');

  // Version-dependent API components. These must run before the generic JSX
  // strippers at the bottom of this function, which would otherwise drop both
  // tags — publishing an empty `Base URL` bullet and an empty `Endpoints`
  // section to every agent while the superseded v3.0 operation pages published
  // a complete working request. That asymmetry is why agents reached for v3.
  result = result.replace(/<ApiBaseUrl\s*\/>/g, `\`${API_BASE_URLS[version]}\``);
  result = result.replace(
    API_ENDPOINTS_TABLE_REGEX,
    (_, bracedPayload?: string, quotedPayload?: string) =>
      endpointsTableToMarkdown(
        bracedPayload ?? decodeHtmlEntities(quotedPayload ?? ''),
        version,
        url
      )
  );

  result = replaceHomeNavigationMarkdown(result);

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
  result = result.replace(/<\/?Cards\b[^>]*>/g, '');

  // Convert Card - handle multiline and various attribute orders
  result = result.replace(
    /<Card\b[\s\S]*?title="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?\/>/g,
    '- [$1]($2): $3'
  );
  result = result.replace(
    /<Card\b[\s\S]*?title="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Card>/g,
    '- [$1]($2): $3'
  );
  result = result.replace(
    /<Card\b[\s\S]*?href="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Card>/g,
    '- [$2]($1): $3'
  );
  result = result.replace(
    /<ProviderCard[\s\S]*?name="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?languages=\{\[([^\]]*)\]\}[\s\S]*?\/>/g,
    (_, name, href, langs) => `- [${name}](${href}) (${langs.replace(/"/g, '')})`
  );

  result = result.replace(/^[ \t]+(- \[)/gm, '$1');

  result = result.replace(/<TabsList>[\s\S]*?<\/TabsList>/g, '');
  result = result.replace(/<TabsTrigger[^>]*>[^<]*<\/TabsTrigger>/g, '');
  result = result.replace(
    /<TabsContent[\s\S]*?value="([^"]*)"[\s\S]*?>([\s\S]*?)<\/TabsContent>/g,
    '\n**$1:**\n$2'
  );
  result = result.replace(
    /<Tab[\s\S]*?value="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Tab>/g,
    '\n**$1:**\n$2'
  );

  result = result.replace(/<StepTitle>([\s\S]*?)<\/StepTitle>/g, (_, title) => {
    const cleanTitle = title
      .replace(/^[\s#]*#\s*/, '')
      .replace(/\s+$/, '')
      .trim();
    return cleanTitle ? `#### ${cleanTitle}` : '';
  });
  result = result.replace(/<Step>\s*###\s*(.+)/g, '#### $1');
  result = result.replace(/<\/?Steps>/g, '');
  result = result.replace(/<\/?Step>/g, '');
  result = result.replace(/^(\s*#{1,6})\s+#\s+(.+)$/gm, '$1 $2');
  result = result.replace(/^\s*#\s*$/gm, '');

  result = result.replace(/<FrameworkOption[\s\S]*?name="([^"]*)"[\s\S]*?>/g, '\n## $1\n');
  result = result.replace(/<\/FrameworkOption>/g, '');

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
  result = result.replace(
    /<IntegrationTabs(?![^>]*tabs=)[\s\S]*?>/g,
    '\n> Choose your integration type · [Use this guide to decide](/docs/native-tools-vs-mcp)\n'
  );

  result = result.replace(
    /<IntegrationContent[\s\S]*?value="([^"]*)"[\s\S]*?>/g,
    (_, value: string) => `\n### ${tabLabelMap[value] || value}\n`
  );
  result = result.replace(/<\/IntegrationContent>/g, '');

  result = result.replace(
    /<Accordion[\s\S]*?title="([^"]*)"[\s\S]*?>([\s\S]*?)<\/Accordion>/g,
    '\n**$1**\n$2'
  );

  result = result.replace(
    /<Figure[\s\S]*?src="([^"]*)"[\s\S]*?alt="([^"]*)"[\s\S]*?caption="([^"]*)"[\s\S]*?\/>/g,
    '![$2]($1)\n*$3*'
  );
  result = result.replace(
    /<Figure[\s\S]*?src="([^"]*)"[\s\S]*?alt="([^"]*)"[\s\S]*?\/>/g,
    '![$2]($1)'
  );

  result = result.replace(/<ToolTypeOption[\s\S]*?name="([^"]*)"[\s\S]*?>/g, '\n### $1\n');
  result = result.replace(/<\/ToolTypeOption>/g, '');

  result = result.replace(
    /<TemplateCard[\s\S]*?title="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?href="([^"]*)"[\s\S]*?\/>/g,
    '- [$1]($3): $2'
  );
  result = result.replace(
    /<TemplateCard[\s\S]*?href="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?description="([^"]*)"[\s\S]*?\/>/g,
    '- [$2]($1): $3'
  );

  result = result.replace(
    /<GlossaryTerm[\s\S]*?name="([^"]*)"[\s\S]*?>([\s\S]*?)<\/GlossaryTerm>/g,
    (_, name, content) => `### ${name}\n\n${content.trim()}`
  );

  result = result.replace(
    /<AIToolsBanner\s*\/>/g,
    '### For AI tools\n\n' +
      '**Skills:**\n' +
      '```bash\nnpx skills add ComposioHQ/composio --skill composio -y\n```\n' +
      '[GitHub](https://github.com/ComposioHQ/composio/tree/next/skills/composio)\n\n' +
      '**CLI:**\n' +
      '```bash\ncurl -fsSL https://composio.dev/install | sh\n```\n' +
      '[CLI Reference](/docs/cli)\n\n' +
      '**Context:**\n' +
      '- [llms.txt](/llms.txt) — Documentation index with links\n' +
      '- [llms-full.txt](/llms-full.txt) — Complete documentation in one file'
  );

  result = result.replace(
    /<ConnectClientOption[^>]*\bname="([^"]*)"[^>]*>/g,
    (_, name) => `## ${name}\n`
  );

  // FileBuildup renders an example's file growing step by step. The JSX can't
  // serialize to markdown, so the .md an agent reads would otherwise lose every
  // line of real code. Emit the actual source from the FILE_BUILDS registry:
  // `<FileBuildup name="bot" step={2} />` -> the full file at that step;
  // without `step` -> the final complete file.
  result = result.replace(
    /<FileBuildup\s+name="([^"]+)"(?:\s+step=\{(\d+)\})?\s*\/>/g,
    (_, name: string, step?: string) => {
      const build = FILE_BUILDS[name];
      if (!build || !build.stages?.length) return '';
      const lang = /\.tsx?$/.test(build.file)
        ? 'typescript'
        : /\.py$/.test(build.file)
          ? 'python'
          : '';
      const idx = step ? Number(step) - 1 : build.stages.length - 1;
      const stage = build.stages[idx];
      if (!stage) return '';
      const label = step ? ` — step ${step}: ${stage.title}` : ' — complete file';
      return `\n**\`${build.file}\`${label}**\n\n\`\`\`${lang}\n${stage.code.trim()}\n\`\`\`\n`;
    }
  );

  result = replaceRepoBrowserMarkdown(result);

  result = result.replace(
    /<\/?(ProviderGrid|Tabs|Frame|div|QuickstartFlow|IntegrationTabs|Accordions|ToolTypeFlow|ToolkitsLanding|TemplateGrid|Glossary|ConnectFlow|ConnectClientOption)[^>]*>/g,
    ''
  );

  result = result.replace(/<[A-Z][a-zA-Z]*[\s\S]*?\/>/g, '');
  result = result.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  const lines = result.split('\n');
  const normalizedLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      const nonEmptyLines = codeBlockLines.filter(l => l.trim().length > 0);
      const minIndent =
        nonEmptyLines.length > 0
          ? Math.min(...nonEmptyLines.map(l => l.match(/^(\s*)/)?.[1]?.length || 0))
          : 0;
      for (const codeLine of codeBlockLines) {
        normalizedLines.push(codeLine.slice(minIndent));
      }
      codeBlockLines = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
        normalizedLines.push(line.trim());
      } else {
        inCodeBlock = true;
        normalizedLines.push(line.trim());
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    } else {
      const trimmedLine = line.trimStart();
      if (/^\s*[{}]\s*$/.test(line)) {
        continue;
      }
      if (trimmedLine.match(/^[-*+]\s/) || trimmedLine.match(/^\d+\.\s/)) {
        const leadingSpaces = line.length - trimmedLine.length;
        const indentLevel = Math.floor(leadingSpaces / 2);
        const normalizedIndent = '  '.repeat(Math.min(indentLevel, 4));
        normalizedLines.push(normalizedIndent + trimmedLine);
      } else {
        normalizedLines.push(trimmedLine);
      }
    }
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }

  result = normalizedLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = stripTwoslashFromCodeBlocks(result);

  return result.trim();
}

function stripTwoslashFromCodeBlocks(content: string): string {
  return content.replace(/(```[\w]*\n)([\s\S]*?)(```)/g, (match, open, code, close) => {
    let cleanCode = code;
    cleanCode = cleanCode.replace(/^\/\/\s*---cut---.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@errors?:.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@noErrors.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@filename:.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*@highlight.*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\/\/\s*\^[\?\!].*\n?/gm, '');
    cleanCode = cleanCode.replace(/^\n+/, '');
    return open + cleanCode + close;
  });
}

export interface LLMPage {
  url: string;
  data: {
    title: string;
    description?: string;
    getText?: (mode: 'processed' | 'raw') => Promise<string>;
    legacy?: boolean;
    written?: string;
    llmGuardrails?: Parameters<typeof getGuardrails>[0];
  };
}

export async function getLLMText(
  page: LLMPage,
  options?: { includeFooter?: boolean; includeGuardrails?: boolean }
) {
  const includeFooter = options?.includeFooter ?? true;
  const includeGuardrails = options?.includeGuardrails ?? true;
  if (typeof page.data.getText !== 'function') {
    return `# ${page.data.title} (${page.url})

${page.data.description || ''}`;
  }

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

  const cleanSegments = segments.map(s => mdxToCleanMarkdown(s, page.url));
  let cleanContent = cleanSegments[0];
  for (let i = 0; i < mermaidCharts.length; i++) {
    const chart = mermaidCharts[i]
      .replace(/&#x22;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&');
    cleanContent += `\n\n\`\`\`mermaid\n${chart}\n\`\`\`\n\n${cleanSegments[i + 1]}`;
  }

  const footer = includeFooter
    ? `\n\n---\n\n📚 **More documentation:** [View all docs](https://docs.composio.dev/llms.txt) | [Glossary](https://docs.composio.dev/llms.mdx/reference/glossary) | [Examples](https://docs.composio.dev/llms.mdx/examples) | [API Reference](https://docs.composio.dev/llms.mdx/reference)`
    : '';

  // Legacy pages (frontmatter `legacy: true`) document point-in-time migrations
  // and may show outdated APIs. Mark the .md so an agent reading it knows, and
  // skip the "enforce the CURRENT patterns" guardrail block — appending it to a
  // legacy guide contradicts the guide's own (older) content.
  const isLegacy = page.data.legacy === true;
  const written = page.data.written;
  const frontmatterNote = isLegacy
    ? `\n> **Legacy${written ? ` · written ${written}` : ''}.** This is a point-in-time migration/legacy guide and may describe outdated APIs. For current guidance, see https://docs.composio.dev.\n`
    : written
      ? `\n> _Written ${written}._\n`
      : '';

  // Which REST version this page documents. Scoped to the reference tree —
  // /docs/** has no REST version — and carries no guidance paragraph, because
  // the guardrail block further down this same response already does.
  const topNote = `${frontmatterNote}${apiVersionPointer(page.url)}`;

  const guardrails = includeGuardrails && !isLegacy ? getGuardrails(page.data.llmGuardrails) : '';

  return `# ${page.data.title} (${page.url})
${topNote}
${cleanContent}${footer}${guardrails}`;
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateDateFormat(dateStr: string): void {
  if (!DATE_REGEX.test(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD (e.g., "2025-12-29")`);
  }
}

export function dateToChangelogUrl(dateStr: string): string {
  validateDateFormat(dateStr);
  const [year, month, day] = dateStr.split('-');
  return `/docs/changelog/${year}/${month}/${day}`;
}

export function dateToSlug(dateStr: string): string[] {
  validateDateFormat(dateStr);
  const [year, month, day] = dateStr.split('-');
  return [year, month, day];
}

export function slugToDate(slug: string[]): string | null {
  if (slug.length !== 3) return null;
  const [year, month, day] = slug;
  return `${year}-${month}-${day}`;
}
