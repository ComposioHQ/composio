// Use direct imports from collections to avoid top-level await in lib/source.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { docs, reference, cookbooks, toolkits } from 'fumadocs-mdx:collections/server';
import { loader, multiple } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiSource, openapiPlugin } from 'fumadocs-openapi/server';
import type { AdvancedIndex } from 'fumadocs-core/search/server';
import type { DocumentRecord } from 'fumadocs-core/search/algolia';
import { openapi } from '@/lib/openapi';
import { getAllToolkitsSync } from '@/lib/toolkit-data';

// Create loaders directly here to avoid the problematic lib/source.ts import.
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

// Dynamic toolkit entries from toolkits.json.
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

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.+))$`, 'm'));
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value?.trim();
}

function getChangelogIndexes(): SearchIndex[] {
  const changelogDir = join(process.cwd(), 'content/changelog');
  if (!existsSync(changelogDir)) return [];

  return readdirSync(changelogDir)
    .filter((file) => file.endsWith('.mdx'))
    .flatMap((file) => {
      const source = readFileSync(join(changelogDir, file), 'utf8');
      const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1];
      if (!frontmatter) return [];

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

type SearchIndex = AdvancedIndex & {
  keywords?: string[];
};

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

function listContentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listContentFiles(path);
    if (entry.isFile() && /\.mdx?$/.test(entry.name)) return [path];
    return [];
  });
}

function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[<>]/g, '')
    .replace(/[`*_~\[\]()]/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function stripMdx(value: string): string {
  return value
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[<>]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStructuredData(markdown: string) {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const headings: { content: string; id: string }[] = [];
  const contents: { content: string; heading: string | undefined }[] = [];
  const lines = body.split('\n');
  let currentHeading: string | undefined;
  let current: string[] = [];

  function flush() {
    const content = stripMdx(current.join('\n'));
    if (content) contents.push({ content, heading: currentHeading });
    current = [];
  }

  for (const line of lines) {
    const match = line.match(/^(#{2,6})\s+(.+)$/);
    if (match) {
      flush();
      const content = stripMdx(match[2] ?? '');
      if (content) {
        const id = slugifyHeading(content);
        headings.push({ content, id });
        currentHeading = id;
      }
      continue;
    }

    current.push(line);
  }

  flush();
  if (contents.length === 0) {
    const content = stripMdx(body);
    if (content) contents.push({ content, heading: undefined });
  }

  return { headings, contents };
}

function urlFromContentPath(path: string): string | undefined {
  const rel = relative(join(process.cwd(), 'content'), path).replace(/\\/g, '/');
  const withoutExt = rel.replace(/\.mdx?$/, '');
  const parts = withoutExt.split('/');
  const collection = parts.shift();
  if (!collection) return undefined;

  if (collection === 'docs') return `/docs/${parts.join('/')}`.replace(/\/index$/, '');
  if (collection === 'cookbooks') return `/cookbooks/${parts.join('/')}`.replace(/\/index$/, '');
  if (collection === 'reference') return `/reference/${parts.join('/')}`.replace(/\/index$/, '');
  if (collection === 'toolkits') {
    if (parts[0] === 'faq') return undefined;
    return `/toolkits/${parts.join('/')}`.replace(/\/index$/, '');
  }
  if (collection === 'changelog') return undefined;

  return undefined;
}

function getFilesystemIndexes(): SearchIndex[] {
  const contentDir = join(process.cwd(), 'content');
  return listContentFiles(contentDir).flatMap((file) => {
    const url = urlFromContentPath(file);
    if (!url) return [];

    const source = readFileSync(file, 'utf8');
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const title = getFrontmatterValue(frontmatter, 'title');
    if (!title) return [];

    return [{
      id: url,
      title,
      description: getFrontmatterValue(frontmatter, 'description'),
      url,
      structuredData: buildStructuredData(source),
      keywords: getFrontmatterValue(frontmatter, 'keywords')?.split(',').map((keyword) => keyword.trim()),
    } satisfies SearchIndex];
  });
}

async function getOpenApiSearchIndexes(): Promise<SearchIndex[]> {
  const openapiPages = await openapiSource(openapi, {
    groupBy: 'tag',
    baseDir: 'api-reference',
  });

  const openapiOnlySource = loader({
    baseUrl: '/reference',
    source: openapiPages,
    plugins: [lucideIconsPlugin(), openapiPlugin()],
  });

  return openapiOnlySource.getPages().map((page) => ({
    id: page.url,
    title: page.data.title ?? 'Untitled',
    description: page.data.description,
    url: page.url,
    structuredData: page.data.structuredData,
  } satisfies SearchIndex));
}

function toAlgoliaDocument(index: SearchIndex): DocumentRecord {
  const searchableKeywords = index.keywords?.filter(Boolean).join(' ');
  const description = [index.description, searchableKeywords].filter(Boolean).join('\n');

  return {
    _id: index.id,
    title: index.title,
    description,
    breadcrumbs: index.breadcrumbs,
    url: index.url,
    structured: index.structuredData,
    tag: Array.isArray(index.tag) ? index.tag[0] : index.tag,
  } satisfies DocumentRecord;
}

export async function getAlgoliaSearchDocuments(): Promise<DocumentRecord[]> {
  const indexes = [
    ...getFilesystemIndexes(),
    ...dynamicToolkitIndexes,
    ...getChangelogIndexes(),
    ...await getOpenApiSearchIndexes(),
  ];

  const deduped = new Map<string, SearchIndex>();
  for (const index of indexes) deduped.set(index.id, index);

  return Array.from(deduped.values()).map(toAlgoliaDocument);
}
