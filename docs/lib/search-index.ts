// Use direct imports from collections to avoid top-level await in lib/source.ts.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  docs,
  reference,
  examples,
  toolkits,
  knowledgeBase,
} from 'fumadocs-mdx:collections/server';
import { loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';
import type { AdvancedIndex } from 'fumadocs-core/search/server';
import type { BaseIndex } from 'fumadocs-core/search/algolia';
import { openapi } from '@/lib/openapi';
import { mdxToCleanMarkdown } from '@/lib/source';
import { isHiddenApiTagUrl } from '@/lib/filter-api-version';
import { getAllToolkitsSync } from '@/lib/toolkit-data';
import {
  classifyKnowledgeRecord,
  normalizeKnowledgeKeywords,
} from '@/lib/knowledge/metadata';
import { getAuthGuideSearchRecords } from '@/lib/knowledge/auth-guides';
import type {
  KnowledgeIntent,
  KnowledgeMetadata,
  KnowledgeSourceType,
  ProductAreaSlug,
} from '@/lib/knowledge/types';

export const ALGOLIA_DEFAULT_APP_ID = '62HI9PQZ1L';
export const ALGOLIA_DEFAULT_INDEX_NAME = 'docs_composio';

const MAX_CHUNK_CHARS = 3_800;
const MAX_CHUNK_BYTES = 9_000;
const MAX_TOOL_ALIAS_ITEMS = 80;
const MAX_TOOL_ALIAS_BYTES = 2_500;

// Create loaders directly here to avoid the problematic lib/source.ts import in the
// fallback route. This route is intentionally still Fumadocs/Orama-backed for local
// development when Algolia env vars aren't configured.
const docsSource = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const examplesSource = loader({
  baseUrl: '/examples',
  source: examples.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const toolkitsSource = loader({
  baseUrl: '/toolkits',
  source: toolkits.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const knowledgeBaseSource = loader({
  baseUrl: '/kb',
  source: knowledgeBase.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

type SearchIndex = AdvancedIndex & {
  keywords?: string[];
};

export type AlgoliaDocsRecord = BaseIndex & KnowledgeMetadata & {
  objectID: string;
  description?: string;
  keywords?: string[];
  slug?: string;
  headings?: string[];
  tool_names?: string[];
  tool_slugs?: string[];
  type: string;
  lang: string;
  page_rank: number;
  toolkit_popularity: number;
  section_rank: number;
  position: number;
  depth: number;
  tags?: string[];
};

function getFrontmatter(source: string): string {
  return source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
}

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
  // The double-quoted alternative must accept YAML escapes: a title like
  // `"Resolve an \"App is blocked\" error"` otherwise fails the quoted branch,
  // falls through to the catch-all, and surfaces raw quotes-and-backslashes in
  // search results and browse pages.
  const match = frontmatter.match(
    new RegExp(`^${key}:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)'|(.+))$`, 'm')
  );
  if (match?.[1] !== undefined) {
    return match[1].replace(/\\(["\\])/g, '$1').trim();
  }
  const value = match?.[2] ?? match?.[3];
  return value?.trim();
}

function getFrontmatterList(frontmatter: string, key: string): string[] {
  const raw = getFrontmatterValue(frontmatter, key);
  if (!raw) return [];

  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  return [raw];
}

function listContentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listContentFiles(path);
    if (entry.isFile() && /\.mdx?$/.test(entry.name)) return [path];
    return [];
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[<>]/g, '')
    .replace(/[`*_~\[\]()]/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueSlug(value: string, seen: Map<string, number>): string {
  const base = slugify(value) || 'section';
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function splitIntoChunks(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= MAX_CHUNK_CHARS && Buffer.byteLength(next, 'utf8') <= MAX_CHUNK_BYTES) {
      current = next;
      continue;
    }

    pushCurrent();

    if (paragraph.length <= MAX_CHUNK_CHARS && Buffer.byteLength(paragraph, 'utf8') <= MAX_CHUNK_BYTES) {
      current = paragraph;
      continue;
    }

    for (let i = 0; i < paragraph.length; i += MAX_CHUNK_CHARS) {
      chunks.push(paragraph.slice(i, i + MAX_CHUNK_CHARS).trim());
    }
  }

  pushCurrent();
  return chunks;
}

function contentHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

// Sections intentionally kept out of search entirely (not just deprioritized).
// Direct tool execution is the legacy pre-sessions flow — we don't want it
// surfacing in results at all. Matches the prefix and anything beneath it.
const SEARCH_EXCLUDED_PREFIXES = ['/docs/tools-direct'];

function isExcludedFromSearch(url: string): boolean {
  const path = url.replace(/\/$/, '');
  return SEARCH_EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function urlFromContentPath(path: string): { url: string; type: string } | undefined {
  const rel = relative(join(process.cwd(), 'content'), path).replace(/\\/g, '/');
  const withoutExt = rel.replace(/\.mdx?$/, '');
  const parts = withoutExt.split('/');
  const collection = parts.shift();
  if (!collection) return undefined;

  if (collection === 'docs') {
    return { url: `/docs/${parts.join('/')}`.replace(/\/index$/, ''), type: 'docs' };
  }
  if (collection === 'examples') {
    return { url: `/examples/${parts.join('/')}`.replace(/\/index$/, ''), type: 'examples' };
  }
  if (collection === 'reference') {
    const url = `/reference/${parts.join('/')}`.replace(/\/index$/, '');
    return { url, type: url.startsWith('/reference/v3') ? 'v3-reference' : 'reference' };
  }
  if (collection === 'toolkits') {
    if (parts[0] === 'faq') return undefined;
    return { url: `/toolkits/${parts.join('/')}`.replace(/\/index$/, ''), type: 'toolkits' };
  }
  if (collection === 'kb') {
    return { url: `/kb/${parts.join('/')}`.replace(/\/index$/, ''), type: 'kb' };
  }
  if (collection === 'changelog') return undefined;

  return undefined;
}

function slugTokens(url: string): string {
  return url
    .split(/[/-]/)
    .map((part) => part.replace(/[_#?=&.]/g, ' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const typeLabels: Record<string, string> = {
  docs: 'Docs',
  examples: 'Example',
  reference: 'Reference',
  'v3-reference': 'Legacy v3 Reference',
  toolkits: 'Toolkit',
  kb: 'Knowledge Base',
  changelog: 'Changelog',
  'api-reference': 'API Reference',
};

function titleizeSlug(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace(/\bApi\b/g, 'API')
    .replace(/\bMcp\b/g, 'MCP')
    .replace(/\bSdk\b/g, 'SDK')
    .replace(/\bOauth\b/g, 'OAuth');
}

function breadcrumbsForUrl(url: string, type: string): string[] {
  const label = typeLabels[type] ?? titleizeSlug(type);

  if (type === 'toolkits' || type === 'examples' || type === 'changelog') {
    return [label];
  }

  const parts = url.split('/').filter(Boolean);
  const parentParts = parts.slice(1, -1);
  return [label, ...parentParts.map(titleizeSlug)].filter(Boolean);
}

const TOOLKIT_POPULARITY_OVERRIDES: Record<string, number> = {
  gmail: 1_000,
  github: 980,
  slack: 960,
  googledrive: 940,
  googlecalendar: 930,
  notion: 920,
  linear: 900,
  jira: 890,
  hubspot: 860,
  salesforce: 850,
  resend: 650,
  zoho_mail: 520,
  mailchimp: 500,
  sendgrid: 480,
  mailsoftly: 260,
};

function getToolkitSlugFromUrl(url: string): string | null {
  return url.match(/^\/toolkits\/([^/#?]+)/)?.[1] ?? null;
}

function toolkitPopularity(url: string, type: string): number {
  if (type !== 'toolkits') return 0;

  const slug = getToolkitSlugFromUrl(url);
  if (!slug) return 0;

  const toolkit = toolkitBySlug.get(slug);
  const override = TOOLKIT_POPULARITY_OVERRIDES[slug] ?? 0;
  const managedAuthBoost = toolkit?.composioManagedAuthSchemes?.length ? 120 : 0;
  const authBoost = toolkit?.authSchemes?.includes('OAUTH2') ? 40 : 0;
  const triggerBoost = Math.min((toolkit?.triggerCount ?? 0) * 10, 80);
  const toolCountBoost = Math.min((toolkit?.toolCount ?? 0), 100);

  return override + managedAuthBoost + authBoost + triggerBoost + toolCountBoost;
}

function pageRank(url: string, sourceType: KnowledgeSourceType): number {
  // Prefer conceptual docs over generated/reference material when textual
  // relevance is otherwise close. Toolkit aliases can still win earlier via
  // searchableAttributes when the query matches a tool name/slug exactly.
  //
  // Hints use precise path matches against the current (nested) docs structure.
  // When pages move, update these — a stale `.includes()` hint silently boosts
  // nothing. See content/docs/ for the canonical layout.
  if (sourceType === 'docs') {
    const path = url.replace(/\/$/, '');
    if (path === '/docs') return 2_400;
    if (path === '/docs/quickstart') return 2_300;
    if (path === '/docs/how-composio-works') return 2_250;
    if (path === '/docs/authentication') return 2_220;
    if (path.startsWith('/docs/tools-direct/')) return 2_180;
    if (path === '/docs/configuring-sessions') return 2_120;
    if (path.startsWith('/docs/auth-configuration/')) return 2_080;
    if (path === '/docs/triggers' || path.startsWith('/docs/setting-up-triggers/')) return 2_060;
    return 2_000;
  }

  if (sourceType === 'kb') return 1_900;
  if (sourceType === 'oauth-guide') return 1_700;
  if (sourceType === 'toolkit') return 1_500;
  if (sourceType === 'example') return 1_300;
  if (sourceType === 'reference') return 700;
  if (sourceType === 'changelog') return 350;
  if (sourceType === 'legacy') return 25;
  return 400;
}

function knowledgeSourceType(type: string, legacy: boolean): KnowledgeSourceType {
  if (legacy || type === 'v3-reference') return 'legacy';
  if (type === 'docs') return 'docs';
  if (type === 'kb') return 'kb';
  if (type === 'toolkits') return 'toolkit';
  if (type === 'examples') return 'example';
  if (type === 'reference' || type === 'api-reference') return 'reference';
  if (type === 'changelog') return 'changelog';
  throw new Error(`Unsupported search source type: ${type}`);
}

export function recordsFromMarkdownPage(input: {
  url: string;
  type: string;
  title: string;
  description?: string;
  keywords?: string[];
  markdown: string;
  breadcrumbs?: string[];
  tags?: string[];
  toolNames?: string[];
  toolSlugs?: string[];
  legacy?: boolean;
  topics?: string[];
  productAreas?: ProductAreaSlug[];
  toolkitSlugs?: string[];
  intents?: KnowledgeIntent[];
  lastVerifiedAt?: string | null;
}): AlgoliaDocsRecord[] {
  const isLegacy = input.legacy === true;
  const sourceType = knowledgeSourceType(input.type, isLegacy);
  const metadata = classifyKnowledgeRecord({
    sourceType,
    canonicalUrl: input.url,
    productAreas: input.productAreas,
    topics: input.topics,
    toolkitSlugs: input.toolkitSlugs,
    intents: input.intents,
    lastVerifiedAt: input.lastVerifiedAt,
  });
  const resolvedPageRank = pageRank(input.url, sourceType);
  const resolvedTags = isLegacy ? [...(input.tags ?? []), 'legacy'] : input.tags;
  const resolvedKeywords = normalizeKnowledgeKeywords(input.keywords ?? []);
  const clean = mdxToCleanMarkdown(input.markdown, input.url);
  const lines = clean.split('\n');
  const headingSlugs = new Map<string, number>();
  const headings: string[] = [];
  const sections: Array<{ heading?: string; section_id?: string; depth: number; text: string; position: number }> = [];
  let currentHeading: string | undefined;
  let currentSectionId: string | undefined;
  let currentDepth = 0;
  let currentLines: string[] = [];
  let sectionPosition = 0;
  let fenceMarker: string | null = null;
  let fenceLength = 0;

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (!text) return;
    sections.push({
      heading: currentHeading,
      section_id: currentSectionId,
      depth: currentDepth,
      text,
      position: sectionPosition++,
    });
    currentLines = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const markerCharacter = marker[0];
      const suffix = fenceMatch[2];

      if (!fenceMarker) {
        fenceMarker = markerCharacter;
        fenceLength = marker.length;
      } else if (
        markerCharacter === fenceMarker
        && marker.length >= fenceLength
        && suffix.trim() === ''
      ) {
        fenceMarker = null;
        fenceLength = 0;
      }

      currentLines.push(line);
      continue;
    }

    const headingMatch = fenceMarker ? null : line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      const depth = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      currentHeading = heading;
      currentSectionId = uniqueSlug(heading, headingSlugs);
      currentDepth = depth;
      headings.push(heading);
      currentLines.push(line);
      continue;
    }

    currentLines.push(line);
  }
  flush();

  const fallbackText = clean.trim() || [input.title, input.description, ...resolvedKeywords].filter(Boolean).join('\n');
  if (sections.length === 0 && fallbackText) {
    sections.push({ text: fallbackText, position: 0, depth: 0 });
  }

  let recordPosition = 0;
  return sections.flatMap((section) => {
    const chunks = splitIntoChunks(section.text);
    return chunks.map((chunk, chunkIndex) => {
      const sectionPart = section.section_id ?? 'overview';
      const objectID = `${input.url}__${sectionPart}__${chunkIndex}__${contentHash(chunk)}`;
      const sectionRank = Math.max(10, 120 - section.depth * 12 - chunkIndex * 2);

      const position = recordPosition++;
      const includeToolkitAliases = input.type === 'toolkits' && position === 0;

      return {
        objectID,
        title: input.title,
        description: input.description,
        breadcrumbs: input.breadcrumbs,
        url: input.url,
        page_id: input.url,
        section: section.heading,
        section_id: section.section_id,
        content: chunk,
        keywords: resolvedKeywords,
        slug: slugTokens(input.url),
        headings,
        tool_names: includeToolkitAliases ? input.toolNames : undefined,
        tool_slugs: includeToolkitAliases ? input.toolSlugs : undefined,
        type: input.type,
        lang: 'en',
        tags: resolvedTags,
        page_rank: resolvedPageRank,
        toolkit_popularity: toolkitPopularity(
          input.url,
          sourceType === 'toolkit' ? 'toolkits' : input.type,
        ),
        section_rank: sectionRank,
        position,
        depth: section.depth,
        ...metadata,
      } satisfies AlgoliaDocsRecord;
    });
  });
}

const toolkitBySlug = new Map(getAllToolkitsSync().map((toolkit) => [toolkit.slug, toolkit]));

function limitToolkitAliases(values: string[]): string[] {
  const aliases: string[] = [];
  let bytes = 0;

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const nextBytes = Buffer.byteLength(JSON.stringify(trimmed), 'utf8');
    if (aliases.length >= MAX_TOOL_ALIAS_ITEMS || bytes + nextBytes > MAX_TOOL_ALIAS_BYTES) break;

    aliases.push(trimmed);
    bytes += nextBytes;
  }

  return aliases;
}

function getToolkitSearchFields(slug: string): Pick<Parameters<typeof recordsFromMarkdownPage>[0], 'toolNames' | 'toolSlugs' | 'tags'> {
  const toolkit = toolkitBySlug.get(slug);
  if (!toolkit) return {};

  return {
    toolNames: limitToolkitAliases(toolkit.tools.map((tool) => tool.name).filter(Boolean)),
    toolSlugs: limitToolkitAliases(toolkit.tools.map((tool) => tool.slug).filter(Boolean)),
    tags: [toolkit.category].filter(Boolean) as string[],
  };
}

function getFilesystemRecords(): AlgoliaDocsRecord[] {
  const contentDir = join(process.cwd(), 'content');
  return listContentFiles(contentDir).flatMap((file) => {
    const route = urlFromContentPath(file);
    if (!route) return [];
    if (isExcludedFromSearch(route.url)) return [];

    const source = readFileSync(file, 'utf8');
    const frontmatter = getFrontmatter(source);
    const title = getFrontmatterValue(frontmatter, 'title');
    if (!title) return [];

    const keywords = getFrontmatterList(frontmatter, 'keywords');
    const topics = getFrontmatterList(frontmatter, 'topics');
    const explicitToolkitSlugs = getFrontmatterList(frontmatter, 'toolkitSlugs');
    const taggedToolkitSlugs = route.type === 'kb' && topics.includes('toolkits')
      ? keywords.filter((keyword) => toolkitBySlug.has(keyword))
      : [];
    const routeToolkitSlug = route.type === 'toolkits'
      ? route.url.replace(/^\/toolkits\//, '').split('/')[0]
      : null;

    const toolkitFields = route.type === 'toolkits'
      ? getToolkitSearchFields(route.url.replace(/^\/toolkits\//, ''))
      : {};

    const legacy =
      getFrontmatterValue(frontmatter, 'legacy') === 'true' ||
      getFrontmatterValue(frontmatter, 'deprecated') === 'true';

    return recordsFromMarkdownPage({
      url: route.url,
      type: route.type,
      title,
      description: getFrontmatterValue(frontmatter, 'description'),
      keywords,
      markdown: source,
      breadcrumbs: breadcrumbsForUrl(route.url, route.type),
      legacy,
      topics,
      productAreas: getFrontmatterList(frontmatter, 'productAreas').filter(
        (area): area is ProductAreaSlug => [
          'authentication-and-connected-accounts',
          'tools-actions-and-execution',
          'triggers-and-workflows',
          'sdk-api-and-mcp',
          'account-billing-and-security',
        ].includes(area),
      ),
      toolkitSlugs: [
        ...explicitToolkitSlugs,
        ...taggedToolkitSlugs,
        ...(routeToolkitSlug ? [routeToolkitSlug] : []),
      ],
      intents: getFrontmatterList(frontmatter, 'intents') as KnowledgeIntent[],
      lastVerifiedAt: getFrontmatterValue(frontmatter, 'lastVerifiedAt'),
      ...toolkitFields,
    });
  });
}

// Dynamic toolkit entries from toolkits.json. We include a compact sample of tool
// names/slugs so queries like "gmail send email" can still find the Gmail toolkit
// page without indexing the full tool catalog as noisy giant records.
const mdxToolkitSlugs = new Set(
  toolkitsSource.getPages().map((page) => page.slugs.join('/')),
);

const dynamicToolkitIndexes = getAllToolkitsSync()
  .filter((toolkit) => !mdxToolkitSlugs.has(toolkit.slug))
  .map((toolkit) => ({
    id: `/toolkits/${toolkit.slug}`,
    title: toolkit.name,
    description: toolkit.description,
    url: `/toolkits/${toolkit.slug}`,
    structuredData: { headings: [], contents: [] },
    keywords: [toolkit.slug, toolkit.category].filter(Boolean) as string[],
  } satisfies SearchIndex));

function getDynamicToolkitRecords(): AlgoliaDocsRecord[] {
  return getAllToolkitsSync()
    .filter((toolkit) => !mdxToolkitSlugs.has(toolkit.slug))
    .flatMap((toolkit) => {
      const toolsText = (toolkit.tools ?? [])
        .slice(0, 60)
        .map((tool) => `${tool.slug ?? ''} ${tool.name ?? ''}`)
        .join('\n');

      return recordsFromMarkdownPage({
        url: `/toolkits/${toolkit.slug}`,
        type: 'toolkits',
        title: toolkit.name,
        description: toolkit.description,
        keywords: [toolkit.slug, toolkit.category].filter(Boolean) as string[],
        markdown: `# ${toolkit.name}\n\n${toolkit.description ?? ''}\n\n## Available tools\n\n${toolsText}`,
        breadcrumbs: breadcrumbsForUrl(`/toolkits/${toolkit.slug}`, 'toolkits'),
        toolkitSlugs: [toolkit.slug],
        ...getToolkitSearchFields(toolkit.slug),
      });
    });
}

function getChangelogIndexes(): SearchIndex[] {
  const changelogDir = join(process.cwd(), 'content/changelog');
  if (!existsSync(changelogDir)) return [];

  return readdirSync(changelogDir)
    .filter((file) => file.endsWith('.mdx'))
    .flatMap((file) => {
      const source = readFileSync(join(changelogDir, file), 'utf8');
      const frontmatter = getFrontmatter(source);
      const date = getFrontmatterValue(frontmatter, 'date');
      const title = getFrontmatterValue(frontmatter, 'title');
      if (!date || !title) return [];

      const url = `/docs/changelog/${date.replace(/-/g, '/')}`;

      return [{
        id: `${url}#${title}`,
        title,
        description: getFrontmatterValue(frontmatter, 'description') ?? '',
        url,
        structuredData: { headings: [], contents: [] },
        keywords: ['changelog'],
      } satisfies SearchIndex];
    });
}

function getChangelogRecords(): AlgoliaDocsRecord[] {
  const changelogDir = join(process.cwd(), 'content/changelog');
  if (!existsSync(changelogDir)) return [];

  return readdirSync(changelogDir)
    .filter((file) => file.endsWith('.mdx'))
    .flatMap((file) => {
      const source = readFileSync(join(changelogDir, file), 'utf8');
      const frontmatter = getFrontmatter(source);
      const date = getFrontmatterValue(frontmatter, 'date');
      const title = getFrontmatterValue(frontmatter, 'title');
      if (!date || !title) return [];

      return recordsFromMarkdownPage({
        url: `/docs/changelog/${date.replace(/-/g, '/')}`,
        type: 'changelog',
        title,
        description: getFrontmatterValue(frontmatter, 'description'),
        keywords: ['changelog', date],
        markdown: source,
        breadcrumbs: breadcrumbsForUrl(`/docs/changelog/${date.replace(/-/g, '/')}`, 'changelog'),
      });
    });
}

export async function getDocsSearchIndexes(): Promise<SearchIndex[]> {
  // Load OpenAPI pages and build full reference source.
  const openapiPages = await openapiSource(openapi, {
    groupBy: 'tag',
    baseDir: 'api-reference',
  });

  const fullReferenceSource = loader({
    baseUrl: '/reference',
    source: multiple({
      mdx: reference.toFumadocsSource(),
      openapi: openapiPages,
    }),
    plugins: [lucideIconsPlugin(), openapiPlugin()],
  });

  const mdxIndexes = [
    ...docsSource.getPages(),
    ...examplesSource.getPages(),
    ...toolkitsSource.getPages(),
    ...knowledgeBaseSource.getPages(),
    ...fullReferenceSource.getPages(),
  ].filter((page) =>
    !isExcludedFromSearch(page.url) && !isHiddenApiTagUrl(page.url)
  ).map((page) => ({
    id: page.url,
    title: page.data.title ?? 'Untitled',
    description: page.data.description,
    url: page.url,
    structuredData: page.data.structuredData,
    keywords: 'keywords' in page.data ? (page.data.keywords as string[]) : undefined,
  } satisfies SearchIndex));

  const oauthIndexes = getAuthGuideSearchRecords().map((record) => ({
    id: record.page_id,
    title: record.title,
    description: record.description,
    url: record.canonical_url,
    structuredData: {
      headings: [],
      contents: [{ heading: undefined, content: record.content }],
    },
    keywords: record.keywords,
  } satisfies SearchIndex));

  return [...mdxIndexes, ...dynamicToolkitIndexes, ...getChangelogIndexes(), ...oauthIndexes];
}

async function getOpenApiRecords(): Promise<AlgoliaDocsRecord[]> {
  const openapiPages = await openapiSource(openapi, {
    groupBy: 'tag',
    baseDir: 'api-reference',
  });

  const openapiOnlySource = loader({
    baseUrl: '/reference',
    source: openapiPages,
    plugins: [lucideIconsPlugin(), openapiPlugin()],
  });

  return openapiOnlySource.getPages().filter((page) =>
    !isHiddenApiTagUrl(page.url)
  ).flatMap((page) => {
    const contents = [
      page.data.description,
      ...(page.data.structuredData?.headings ?? []).map((heading) => heading.content),
      ...(page.data.structuredData?.contents ?? []).map((content) => content.content),
    ].filter(Boolean).join('\n\n');

    return recordsFromMarkdownPage({
      url: page.url,
      type: 'api-reference',
      title: page.data.title ?? 'Untitled',
      description: page.data.description,
      markdown: `# ${page.data.title ?? 'Untitled'}\n\n${contents}`,
      breadcrumbs: breadcrumbsForUrl(page.url, 'api-reference'),
    });
  });
}

export async function getAlgoliaSearchDocuments(): Promise<AlgoliaDocsRecord[]> {
  const records = [
    ...getFilesystemRecords(),
    ...getDynamicToolkitRecords(),
    ...getChangelogRecords(),
    ...getAuthGuideSearchRecords(),
    ...await getOpenApiRecords(),
  ];

  const deduped = new Map<string, AlgoliaDocsRecord>();
  for (const record of records) deduped.set(record.objectID, record);

  return Array.from(deduped.values());
}
