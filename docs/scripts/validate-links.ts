import {
  type FileObject,
  printErrors,
  scanURLs,
  validateFiles,
} from 'next-validate-link';
import type { InferPageType } from 'fumadocs-core/source';
import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
  toolkitsSource,
} from '../lib/source';

type AnySource =
  | typeof source
  | typeof toolRouterSource
  | typeof referenceSource
  | typeof examplesSource
  | typeof toolkitsSource;

async function checkLinks() {
  const scanned = await scanURLs({
    preset: 'next',
    populate: {
      // Dynamic routes
      'docs/[[...slug]]': source.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page),
      })),
      'tool-router/[[...slug]]': toolRouterSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page),
      })),
      'reference/[[...slug]]': referenceSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page),
      })),
      'examples/[[...slug]]': examplesSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page),
      })),
      'toolkits/[[...slug]]': toolkitsSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page),
      })),
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

function getHeadings({ data }: InferPageType<AnySource>): string[] {
  if (!data.toc) return [];
  return data.toc.map((item) => item.url.slice(1));
}

async function getFiles(): Promise<FileObject[]> {
  const sources = [source, toolRouterSource, referenceSource, examplesSource, toolkitsSource];
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

  return allFiles;
}

void checkLinks();
