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
  console.log('Scanning URLs from all sources...');

  const scanned = await scanURLs({
    preset: 'next',
    populate: {
      // Main docs
      'docs/[[...slug]]': source.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page as InferPageType<typeof source>),
      })),
      // Changelog pages (nested under docs)
      'docs/changelog/[...slug]': source.getPages()
        .filter((page) => page.url.startsWith('/docs/changelog'))
        .map((page) => ({
          value: { slug: page.slugs },
          hashes: [],
        })),
      // Tool Router docs
      'tool-router/[[...slug]]': toolRouterSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page as InferPageType<typeof toolRouterSource>),
      })),
      // Reference/SDK docs
      'reference/[[...slug]]': referenceSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page as InferPageType<typeof referenceSource>),
      })),
      // Examples
      'examples/[[...slug]]': examplesSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page as InferPageType<typeof examplesSource>),
      })),
      // Toolkits - these are dynamic pages, include index
      'toolkits/[[...slug]]': toolkitsSource.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page as InferPageType<typeof toolkitsSource>),
      })),
      // API routes (these are valid but not pages)
      'llms.txt/route': [{ value: {}, hashes: [] }],
      'llms-full.txt/route': [{ value: {}, hashes: [] }],
    },
  });

  console.log(`Scanned ${Object.keys(scanned).length} URL patterns`);

  // Collect all files from all sources
  const allFiles = await getAllFiles();
  console.log(`Validating ${allFiles.length} files...`);

  const errors = await validateFiles(allFiles, {
    scanned,
    markdown: {
      components: {
        // Check href attributes in common MDX components
        Card: { attributes: ['href'] },
        Cards: { attributes: ['href'] },
        Link: { attributes: ['href'] },
        a: { attributes: ['href'] },
      },
    },
    // Check relative paths as URLs
    checkRelativePaths: 'as-url',
  });

  const hasErrors = printErrors(errors, true);

  if (hasErrors) {
    console.log('\n❌ Link validation failed. Please fix the broken links above.');
    process.exit(1);
  } else {
    console.log('\n✅ All links are valid!');
    process.exit(0);
  }
}

function getHeadings(page: InferPageType<AnySource>): string[] {
  // Extract heading IDs from table of contents
  if (!page.data.toc) return [];
  return page.data.toc.map((item) => item.url.slice(1));
}

async function getAllFiles(): Promise<FileObject[]> {
  const sources = [
    { source, name: 'docs' },
    { source: toolRouterSource, name: 'tool-router' },
    { source: referenceSource, name: 'reference' },
    { source: examplesSource, name: 'examples' },
    { source: toolkitsSource, name: 'toolkits' },
  ];

  const allPromises: Promise<FileObject | null>[] = [];

  for (const { source: src } of sources) {
    const pages = src.getPages();
    for (const page of pages) {
      allPromises.push(
        (async (): Promise<FileObject | null> => {
          // Skip pages without absolutePath (e.g., OpenAPI generated pages)
          if (!page.absolutePath) {
            return null;
          }

          // Only process .md and .mdx files
          if (!page.absolutePath.endsWith('.md') && !page.absolutePath.endsWith('.mdx')) {
            return null;
          }

          try {
            const content = await page.data.getText('raw');
            return {
              path: page.absolutePath,
              content,
              url: page.url,
              data: page.data,
            };
          } catch {
            // Fallback for pages that don't support getText
            return null;
          }
        })()
      );
    }
  }

  const results = await Promise.all(allPromises);
  return results.filter((file): file is FileObject => file !== null);
}

void checkLinks();
