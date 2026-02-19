import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type FileObject,
  printErrors,
  scanURLs,
  validateFiles,
} from 'next-validate-link';
import GithubSlugger from 'github-slugger';
import {
  source,
  getReferenceSource,
  cookbooksSource,
  toolkitsSource,
} from '../lib/source';

type AnySource =
  | typeof source
  | Awaited<ReturnType<typeof getReferenceSource>>
  | typeof cookbooksSource
  | typeof toolkitsSource;

type PageOf = ReturnType<AnySource['getPages']>[number];

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

/**
 * Get headings for a page, trying data.toc first then falling back to raw content parsing.
 */
async function getHeadingsForPage(page: PageOf): Promise<string[]> {
  if (page.data.toc?.length) {
    return page.data.toc.map((item: { url: string }) => item.url.slice(1));
  }
  if ('getText' in page.data) {
    try {
      const content = await (page.data as { getText: (mode: string) => Promise<string> }).getText('raw');
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
    })),
  );
}

async function getDynamicToolkitEntries() {
  const raw = await readFile('public/data/toolkits.json', 'utf-8');
  const toolkits: { slug: string }[] = JSON.parse(raw);
  return toolkits.map((t) => ({ value: { slug: [t.slug] }, hashes: [] as string[] }));
}

async function checkLinks() {
  const referenceSource = await getReferenceSource();
  const [docsEntries, refEntries, cookbookEntries, toolkitEntries, dynamicToolkitEntries] = await Promise.all([
    buildPopulateEntries(source),
    buildPopulateEntries(referenceSource),
    buildPopulateEntries(cookbooksSource),
    buildPopulateEntries(toolkitsSource),
    getDynamicToolkitEntries(),
  ]);

  const scanned = await scanURLs({
    preset: 'next',
    populate: {
      // Keys must include (home) route group to match app directory structure
      '(home)/docs/[[...slug]]': docsEntries,
      '(home)/reference/[[...slug]]': refEntries,
      '(home)/cookbooks/[[...slug]]': cookbookEntries,
      '(home)/toolkits/[[...slug]]': [...toolkitEntries, ...dynamicToolkitEntries],
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
  });

  // Filter out API route URLs (these are valid but not detected as pages)
  const ignoredUrls = ['/llms.txt', '/llms-full.txt'];
  const filteredErrors = errors
    .map((fileError) => ({
      ...fileError,
      errors: fileError.errors.filter((e) => !ignoredUrls.includes(e.url)),
      detected: fileError.detected.filter((d) => !ignoredUrls.includes(d[0] as string)),
    }))
    .filter((fileError) => fileError.errors.length > 0);

  printErrors(filteredErrors, true);
  if (filteredErrors.length > 0) {
    process.exit(1);
  }
}

async function getFiles(): Promise<FileObject[]> {
  const referenceSource = await getReferenceSource();
  const sources = [source, referenceSource, cookbooksSource, toolkitsSource];
  const allFiles: FileObject[] = [];

  for (const src of sources) {
    const pages = src.getPages();
    for (const page of pages) {
      if (!page.absolutePath) continue;
      if (!page.absolutePath.endsWith('.mdx') && !page.absolutePath.endsWith('.md')) continue;
      // Skip OpenAPI-generated pages (they don't have getText)
      if (!('getText' in page.data)) continue;

      allFiles.push({
        path: page.absolutePath,
        content: await (page.data as { getText: (mode: string) => Promise<string> }).getText('raw'),
        url: page.url,
        data: page.data,
      });
    }
  }

  // Scan any .md files under content/ not already covered by Fumadocs sources
  const coveredPaths = new Set(allFiles.map((f) => resolve(f.path)));
  const extraMdFiles = await Array.fromAsync(glob('content/**/*.md'));
  for (const filePath of extraMdFiles) {
    if (coveredPaths.has(resolve(filePath))) continue;
    const content = await readFile(filePath, 'utf-8');
    allFiles.push({ path: filePath, content });
  }

  return allFiles;
}

void checkLinks();
