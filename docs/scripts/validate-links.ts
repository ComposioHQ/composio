import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type FileObject, printErrors, scanURLs, validateFiles } from 'next-validate-link';
import GithubSlugger from 'github-slugger';
import { z } from 'zod';
import {
  source,
  getReferenceSource,
  examplesSource,
  toolkitsSource,
  knowledgeBaseSource,
} from '../lib/source';
import { getLocalKnowledgeDiscoveryPaths } from '../lib/knowledge/discovery';

/**
 * `--external` additionally HEAD/GET-checks every external URL. Slow and
 * dependent on third-party uptime, so it runs on a schedule (nightly CI),
 * never on the PR path.
 */
const checkExternalLinks = process.argv.includes('--external');

type AnySource =
  | typeof source
  | Awaited<ReturnType<typeof getReferenceSource>>
  | typeof examplesSource
  | typeof toolkitsSource
  | typeof knowledgeBaseSource;

type PageOf = ReturnType<AnySource['getPages']>[number];

export function withoutFrontmatter(content: string): string {
  return content.replace(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/**
 * Extract heading anchors from raw MDX/markdown content.
 * Falls back to this when data.toc is unavailable (outside Next.js runtime).
 * Uses github-slugger to match rehype-slug's algorithm (handles Unicode, duplicate suffixes).
 */
function extractHeadingsFromContent(content: string): string[] {
  const slugger = new GithubSlugger();
  const headings: string[] = [];
  let inCodeBlock = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      headings.push(slugger.slug(match[1]));
    }
  }
  return headings;
}

// Page data differs per source (MDX pages carry toc/getText, OpenAPI pages do
// not), so the pieces this script walks are parsed instead of guarded by hand.
const tocEntrySchema = z.object({ url: z.string() });
const tocPageDataSchema = z.object({ toc: z.array(z.unknown()) });
const textPageDataSchema = z.object({
  getText: z.custom<(mode: 'processed' | 'raw') => Promise<string>>(
    value => typeof value === 'function'
  ),
});

/**
 * Get headings for a page, trying data.toc first then falling back to raw content parsing.
 */
async function getHeadingsForPage(page: PageOf): Promise<string[]> {
  const tocData = tocPageDataSchema.safeParse(page.data);
  if (tocData.success && tocData.data.toc.length > 0) {
    return tocData.data.toc.flatMap(item => {
      const entry = tocEntrySchema.safeParse(item);
      return entry.success ? [entry.data.url.slice(1)] : [];
    });
  }
  const textData = textPageDataSchema.safeParse(page.data);
  if (textData.success) {
    try {
      const content = await textData.data.getText('raw');
      return extractHeadingsFromContent(content);
    } catch {
      // fall through
    }
  }
  if (page.absolutePath) {
    try {
      const content = await readFile(page.absolutePath, 'utf-8');
      return extractHeadingsFromContent(content);
    } catch {
      // fall through
    }
  }
  return [];
}

/**
 * Build populate entries for a source, resolving headings asynchronously.
 */
async function buildPopulateEntries(src: AnySource) {
  return Promise.all(
    src.getPages().map(async (page: PageOf) => ({
      value: { slug: page.slugs },
      hashes: await getHeadingsForPage(page),
    }))
  );
}

const toolkitSlugsSchema = z.array(z.object({ slug: z.string() }));

async function getDynamicToolkitEntries() {
  const raw = await readFile('public/data/toolkits.json', 'utf-8');
  const toolkits = toolkitSlugsSchema.parse(JSON.parse(raw));
  return toolkits.map(t => ({ value: { slug: [t.slug] }, hashes: [] as string[] }));
}

const EXTERNAL_FETCH_HEADERS = {
  // Some hosts reject requests without a browser-like UA (bot filters).
  'user-agent':
    'Mozilla/5.0 (compatible; composio-docs-link-check; +https://docs.composio.dev)',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
};

async function fetchStatus(url: URL, method: 'HEAD' | 'GET'): Promise<number> {
  const response = await fetch(url, {
    method,
    headers: EXTERNAL_FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  await response.body?.cancel();
  return response.status;
}

const externalResultCache = new Map<
  string,
  Promise<{ success: true } | { success: false; message?: string }>
>();

/**
 * Replaces next-validate-link's default external validator (bare HEAD, no
 * timeout, no UA, no retry). This one only fails on evidence the link is dead
 * — 404/410, or a network error after a retry. Auth walls, rate limits, and
 * transient 5xx count as reachable: the nightly job hunts dead links, not
 * third-party uptime.
 */
function validateExternalUrl(url: URL) {
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return Promise.resolve({ success: true as const });
  }
  const cached = externalResultCache.get(url.href);
  if (cached) return cached;

  const result = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let status = await fetchStatus(url, 'HEAD');
        // Many servers reject HEAD (405, bot filters); confirm with GET.
        if (status >= 400) status = await fetchStatus(url, 'GET');
        if (status === 404 || status === 410) {
          return { success: false as const, message: `responded status ${status}` };
        }
        return { success: true as const };
      } catch (error) {
        if (attempt === 0) continue;
        return {
          success: false as const,
          message: error instanceof Error ? error.message : 'fetch failed',
        };
      }
    }
    return { success: false as const };
  })();
  externalResultCache.set(url.href, result);
  return result;
}

async function checkLinks() {
  const referenceSource = await getReferenceSource();
  const knowledgeDiscoveryPaths = await getLocalKnowledgeDiscoveryPaths();
  const knowledgeTopicEntries = knowledgeDiscoveryPaths
    .filter((path) => path.startsWith('/kb/topic/'))
    .map((path) => ({ value: path.slice('/kb/topic/'.length), hashes: [] as string[] }));
  const knowledgeToolkitEntries = knowledgeDiscoveryPaths
    .filter((path) => path.startsWith('/kb/toolkit/'))
    .map((path) => ({ value: path.slice('/kb/toolkit/'.length), hashes: [] as string[] }));
  const [
    docsEntries,
    refEntries,
    exampleEntries,
    toolkitEntries,
    knowledgeBaseEntries,
    dynamicToolkitEntries,
  ] = await Promise.all([
    buildPopulateEntries(source),
    buildPopulateEntries(referenceSource),
    buildPopulateEntries(examplesSource),
    buildPopulateEntries(toolkitsSource),
    buildPopulateEntries(knowledgeBaseSource),
    getDynamicToolkitEntries(),
  ]);
  const knowledgeGuideEntries = knowledgeBaseEntries.flatMap((entry) => {
    const value = entry.value;
    if (!value || Array.isArray(value) || typeof value === 'string' || !('slug' in value)) return [];
    const slug = value.slug;
    const segments = Array.isArray(slug) ? slug : [slug];
    return segments.length === 2 && segments[0] === 'guide'
      ? [{ ...entry, value: segments[1] }]
      : [];
  });

  const scanned = await scanURLs({
    preset: 'next',
    populate: {
      // Keys must include (home) route group to match app directory structure
      '(home)/docs/[[...slug]]': docsEntries,
      '(home)/reference/[[...slug]]': refEntries,
      '(home)/examples/[[...slug]]': exampleEntries,
      '(home)/toolkits/[[...slug]]': [...toolkitEntries, ...dynamicToolkitEntries],
      '(home)/kb/guide/[slug]': knowledgeGuideEntries,
      '(home)/kb/topic/[slug]': knowledgeTopicEntries,
      '(home)/kb/toolkit/[slug]': knowledgeToolkitEntries,
    },
  });

  const errors = await validateFiles(await getFiles(), {
    scanned,
    markdown: {
      components: {
        Card: { attributes: ['href'] },
      },
    },
    checkRelativePaths: 'as-url',
    checkExternal: checkExternalLinks ? { validate: validateExternalUrl } : false,
  });

  // Filter out API route URLs (these are valid but not detected as pages)
  const ignoredUrls = ['/llms.txt', '/llms-full.txt'];
  const filteredErrors = errors
    .map(fileError => ({
      ...fileError,
      errors: fileError.errors.filter(e => !ignoredUrls.includes(e.url)),
      detected: fileError.detected.filter(d => !ignoredUrls.includes(d[0] as string)),
    }))
    .filter(fileError => fileError.errors.length > 0);

  printErrors(filteredErrors, true);
  if (filteredErrors.length > 0) {
    process.exit(1);
  }
}

async function getFiles(): Promise<FileObject[]> {
  const referenceSource = await getReferenceSource();
  const sources = [source, referenceSource, examplesSource, toolkitsSource, knowledgeBaseSource];
  const allFiles: FileObject[] = [];

  for (const src of sources) {
    const pages = src.getPages();
    for (const page of pages) {
      if (!page.absolutePath) continue;
      if (!page.absolutePath.endsWith('.mdx') && !page.absolutePath.endsWith('.md')) continue;
      // Skip OpenAPI-generated pages (they don't have getText)
      const textData = textPageDataSchema.safeParse(page.data);
      if (!textData.success) continue;

      allFiles.push({
        path: page.absolutePath,
        content: withoutFrontmatter(await textData.data.getText('raw')),
        url: page.url,
        data: page.data,
      });
    }
  }

  // Scan any .md files under content/ not already covered by Fumadocs sources
  const coveredPaths = new Set(allFiles.map(f => resolve(f.path)));
  const extraMdFiles = await Array.fromAsync(glob('content/**/*.md'));
  for (const filePath of extraMdFiles) {
    if (coveredPaths.has(resolve(filePath))) continue;
    const content = withoutFrontmatter(await readFile(filePath, 'utf-8'));
    allFiles.push({ path: filePath, content });
  }

  return allFiles;
}

if (import.meta.main) void checkLinks();
