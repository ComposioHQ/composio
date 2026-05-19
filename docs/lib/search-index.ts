// Use direct imports from collections to avoid top-level await in lib/source.ts.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { docs, reference, cookbooks, toolkits } from 'fumadocs-mdx:collections/server';
import { loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';
import type { AdvancedIndex } from 'fumadocs-core/search/server';
import type { BaseIndex } from 'fumadocs-core/search/algolia';
import { openapi } from '@/lib/openapi';
import { mdxToCleanMarkdown } from '@/lib/source';
import { getAllToolkitsSync } from '@/lib/toolkit-data';

export const ALGOLIA_DEFAULT_APP_ID = '62HI9PQZ1L';
export const ALGOLIA_DEFAULT_INDEX_NAME = 'docs_composio_dev_62hi9pqz1l_pages';

const MAX_CHUNK_CHARS = 3_800;
const MAX_CHUNK_BYTES = 9_000;

// Create loaders directly here to avoid the problematic lib/source.ts import in the
// fallback route. This route is intentionally still Fumadocs/Orama-backed for local
// development when Algolia env vars aren't configured.
const docsSource = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const cookbooksSource = loader({
  baseUrl: '/cookbooks',
  source: cookbooks.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

const toolkitsSource = loader({
  baseUrl: '/toolkits',
  source: toolkits.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

type SearchIndex = AdvancedIndex & {
  keywords?: string[];
};

export type AlgoliaDocsRecord = BaseIndex & {
  objectID: string;
  description?: string;
  keywords?: string[];
  slug?: string;
  headings?: string[];
  type: string;
  lang: string;
  page_rank: number;
  section_rank: number;
  position: number;
  depth: number;
  tags?: string[];
};

function getFrontmatter(source: string): string {
  return source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
}

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.+))$`, 'm'));
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
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

function urlFromContentPath(path: string): { url: string; type: string } | undefined {
  const rel = relative(join(process.cwd(), 'content'), path).replace(/\\/g, '/');
  const withoutExt = rel.replace(/\.mdx?$/, '');
  const parts = withoutExt.split('/');
  const collection = parts.shift();
  if (!collection) return undefined;

  if (collection === 'docs') {
    return { url: `/docs/${parts.join('/')}`.replace(/\/index$/, ''), type: 'docs' };
  }
  if (collection === 'cookbooks') {
    return { url: `/cookbooks/${parts.join('/')}`.replace(/\/index$/, ''), type: 'cookbooks' };
  }
  if (collection === 'reference') {
    return { url: `/reference/${parts.join('/')}`.replace(/\/index$/, ''), type: 'reference' };
  }
  if (collection === 'toolkits') {
    if (parts[0] === 'faq') return undefined;
    return { url: `/toolkits/${parts.join('/')}`.replace(/\/index$/, ''), type: 'toolkits' };
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

function pageRank(url: string, type: string): number {
  if (url === '/docs' || url === '/docs/') return 1_000;
  if (url.includes('/quickstart')) return 980;
  if (url.includes('/authentication')) return 930;
  if (url.includes('/tools-and-toolkits')) return 920;
  if (url.includes('/configuring-sessions')) return 900;
  if (type === 'docs') return 800;
  if (type === 'cookbooks') return 700;
  if (type === 'reference') return 620;
  if (type === 'toolkits') return 560;
  if (type === 'api-reference') return 520;
  if (type === 'changelog') return 200;
  return 400;
}

function recordsFromMarkdownPage(input: {
  url: string;
  type: string;
  title: string;
  description?: string;
  keywords?: string[];
  markdown: string;
  breadcrumbs?: string[];
  tags?: string[];
}): AlgoliaDocsRecord[] {
  const clean = mdxToCleanMarkdown(input.markdown);
  const lines = clean.split('\n');
  const headingSlugs = new Map<string, number>();
  const headings: string[] = [];
  const sections: Array<{ heading?: string; section_id?: string; depth: number; text: string; position: number }> = [];
  let currentHeading: string | undefined;
  let currentSectionId: string | undefined;
  let currentDepth = 0;
  let currentLines: string[] = [];
  let sectionPosition = 0;

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
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      const depth = match[1].length;
      const heading = match[2].trim();
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

  const fallbackText = clean.trim() || [input.title, input.description, ...(input.keywords ?? [])].filter(Boolean).join('\n');
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
        keywords: input.keywords,
        slug: slugTokens(input.url),
        headings,
        type: input.type,
        lang: 'en',
        tags: input.tags,
        page_rank: pageRank(input.url, input.type),
        section_rank: sectionRank,
        position: recordPosition++,
        depth: section.depth,
      } satisfies AlgoliaDocsRecord;
    });
  });
}

function getFilesystemRecords(): AlgoliaDocsRecord[] {
  const contentDir = join(process.cwd(), 'content');
  return listContentFiles(contentDir).flatMap((file) => {
    const route = urlFromContentPath(file);
    if (!route) return [];

    const source = readFileSync(file, 'utf8');
    const frontmatter = getFrontmatter(source);
    const title = getFrontmatterValue(frontmatter, 'title');
    if (!title) return [];

    return recordsFromMarkdownPage({
      url: route.url,
      type: route.type,
      title,
      description: getFrontmatterValue(frontmatter, 'description'),
      keywords: getFrontmatterList(frontmatter, 'keywords'),
      markdown: source,
      breadcrumbs: [route.type, title],
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
        .map((tool) => `${tool.slug ?? ''} ${tool.name ?? ''} ${tool.description ?? ''}`)
        .join('\n');

      return recordsFromMarkdownPage({
        url: `/toolkits/${toolkit.slug}`,
        type: 'toolkits',
        title: toolkit.name,
        description: toolkit.description,
        keywords: [toolkit.slug, toolkit.category].filter(Boolean) as string[],
        markdown: `# ${toolkit.name}\n\n${toolkit.description ?? ''}\n\n## Available tools\n\n${toolsText}`,
        breadcrumbs: ['toolkits', toolkit.name],
        tags: [toolkit.category].filter(Boolean) as string[],
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
        breadcrumbs: ['changelog', title],
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
    ...cookbooksSource.getPages(),
    ...toolkitsSource.getPages(),
    ...fullReferenceSource.getPages(),
  ].map((page) => ({
    id: page.url,
    title: page.data.title ?? 'Untitled',
    description: page.data.description,
    url: page.url,
    structuredData: page.data.structuredData,
    keywords: 'keywords' in page.data ? (page.data.keywords as string[]) : undefined,
  } satisfies SearchIndex));

  return [...mdxIndexes, ...dynamicToolkitIndexes, ...getChangelogIndexes()];
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

  return openapiOnlySource.getPages().flatMap((page) => {
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
      breadcrumbs: ['reference', 'api-reference', page.data.title ?? 'Untitled'],
    });
  });
}

export async function getAlgoliaSearchDocuments(): Promise<AlgoliaDocsRecord[]> {
  const records = [
    ...getFilesystemRecords(),
    ...getDynamicToolkitRecords(),
    ...getChangelogRecords(),
    ...await getOpenApiRecords(),
  ];

  const deduped = new Map<string, AlgoliaDocsRecord>();
  for (const record of records) deduped.set(record.objectID, record);

  return Array.from(deduped.values());
}
