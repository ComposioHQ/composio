/**
 * API reference route guards.
 *
 * fumadocs-openapi's tag grouping silently drops any operation whose tag is
 * not declared in the document's top-level `tags` array (preset-auto:
 * `builder.fromTagName(tag)` returns undefined -> `continue`, no warning).
 * The v10 -> v11 upgrade shipped exactly that: 16 operation pages vanished
 * from the site, sitemap, and search while the checked-in tag landing pages
 * kept rendering quick links that 404ed. Nothing else can catch this class:
 * validate-links only sees markdown links (ApiEndpointsTable hrefs live in a
 * JSX prop), and the integration suite samples fixed routes.
 *
 * Two guards, both derived from the shipped specs rather than snapshots so
 * routine spec syncs (docs-update-data) never churn them:
 *  1. Completeness — every operation/webhook a spec implies maps 1:1 to a page
 *     the production loader path actually generates, regardless of the drop
 *     mechanism.
 *  2. Quick links — every href serialized into an ApiEndpointsTable in
 *     content/reference resolves to a generated page.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loader, multiple } from 'fumadocs-core/source';
import { createOpenAPI, openapiSource } from 'fumadocs-openapi/server';
import { z } from 'zod';

import { openapi, openapiV3 } from '../../lib/openapi';
import { apiEndpointsSchema } from '../../lib/api-endpoints-table-schema';
import { HIDDEN_API_TAGS } from '../../lib/filter-api-version';

const DOCS_DIR = join(import.meta.dir, '../..');

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

interface SpecOperation {
  operationId?: string;
  tags?: string[];
}

interface SpecDocument {
  paths?: Record<string, Record<string, unknown>>;
  webhooks?: Record<string, Record<string, unknown>>;
}

/** Mirrors the default slugify in fumadocs-openapi's auto preset. */
function slugifyTag(tag: string): string {
  return tag.replace(/\s+/g, '-').toLowerCase();
}

/** Mirrors the hidden-tag URL filter applied in lib/source.ts. */
function isHiddenReferenceUrl(url: string): boolean {
  for (const tag of HIDDEN_API_TAGS) {
    if (
      url.startsWith(`/reference/api-reference/${tag}/`) ||
      url.startsWith(`/reference/v3/api-reference/${tag}/`)
    ) {
      return true;
    }
  }
  return false;
}

function* specOperations(document: SpecDocument): Generator<{
  location: string;
  operation: SpecOperation;
}> {
  for (const group of [document.paths, document.webhooks]) {
    for (const [key, pathItem] of Object.entries(group ?? {})) {
      for (const method of HTTP_METHODS) {
        const operation = pathItem?.[method];
        if (!operation || typeof operation !== 'object') continue;
        yield { location: `${method.toUpperCase()} ${key}`, operation };
      }
    }
  }
}

/**
 * URLs the spec implies: one page per visible (operation, tag) pair, named by
 * operationId — the scheme both fumadocs-openapi (groupBy: 'tag', name
 * algorithm v2) and generate-api-index.ts encode.
 */
function expectedReferenceUrls(document: SpecDocument, baseDir: string): Set<string> {
  const urls = new Set<string>();
  for (const { operation } of specOperations(document)) {
    for (const tag of operation.tags ?? []) {
      const tagSlug = slugifyTag(tag);
      if (HIDDEN_API_TAGS.has(tagSlug)) continue;
      urls.add(`/reference/${baseDir}/${tagSlug}/${operation.operationId}`);
    }
  }
  return urls;
}

function loadSpec(fileName: string): SpecDocument {
  return JSON.parse(readFileSync(join(DOCS_DIR, 'public', fileName), 'utf-8'));
}

/**
 * The reference URLs production actually serves, built through the same
 * pipeline as lib/source.ts getReferenceSource (minus the checked-in MDX
 * collection, which bun test cannot load and which contributes no operation
 * pages).
 */
async function generatedReferenceUrls(): Promise<Set<string>> {
  const [latest, v3] = await Promise.all([
    openapiSource(openapi, { groupBy: 'tag', baseDir: 'api-reference' }),
    openapiSource(openapiV3, { groupBy: 'tag', baseDir: 'v3/api-reference' }),
  ]);
  const referenceLoader = loader({
    baseUrl: '/reference',
    source: multiple({ openapi: latest, 'openapi-v3': v3 }),
  });
  return new Set(
    referenceLoader
      .getPages()
      .map((page) => page.url)
      .filter((url) => !isHiddenReferenceUrl(url)),
  );
}

const generatedUrlsPromise = generatedReferenceUrls();

describe('API reference route completeness', () => {
  test('every visible operation declares a tag and an operationId', () => {
    const violations: string[] = [];
    for (const fileName of ['openapi.json', 'openapi-v3.json', 'openapi-webhooks.json']) {
      for (const { location, operation } of specOperations(loadSpec(fileName))) {
        const visibleTags = (operation.tags ?? []).filter(
          (tag) => !HIDDEN_API_TAGS.has(slugifyTag(tag)),
        );
        // Untagged operations fall into fumadocs' synthetic "unknown" tag,
        // which is never declared — the page silently vanishes.
        if ((operation.tags ?? []).length === 0) {
          violations.push(`${fileName}: ${location} has no tags`);
        }
        // Without an operationId, fumadocs falls back to a path-derived file
        // name while generate-api-index derives the href from the summary —
        // the quick link is guaranteed to 404.
        if (visibleTags.length > 0 && !operation.operationId) {
          violations.push(`${fileName}: ${location} has no operationId`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('every spec operation and webhook yields exactly one generated page', async () => {
    const expected = new Set<string>([
      ...expectedReferenceUrls(loadSpec('openapi.json'), 'api-reference'),
      ...expectedReferenceUrls(loadSpec('openapi-webhooks.json'), 'api-reference'),
      ...expectedReferenceUrls(loadSpec('openapi-v3.json'), 'v3/api-reference'),
    ]);
    const generated = await generatedUrlsPromise;

    const missing = [...expected].filter((url) => !generated.has(url)).sort();
    const extra = [...generated].filter((url) => !expected.has(url)).sort();

    expect(expected.size).toBeGreaterThan(0);
    expect(
      missing,
      `pages implied by the OpenAPI specs but not generated (silently dropped):\n${missing.join('\n')}`,
    ).toEqual([]);
    expect(
      extra,
      `generated pages not implied by the OpenAPI specs:\n${extra.join('\n')}`,
    ).toEqual([]);
  });

  test('the completeness diff flags operations whose tag is undeclared', async () => {
    // The exact v10 -> v11 regression, in miniature: "Projects" is used by an
    // operation but missing from the top-level tags array, and lib/openapi's
    // declareOperationTags normalization is deliberately not applied.
    const document = {
      openapi: '3.0.0',
      info: { title: 'Guard fixture', version: '1' },
      tags: [{ name: 'Auth' }],
      paths: {
        '/v3.1/project/usage/summary': {
          post: {
            tags: ['Projects'],
            operationId: 'postProjectUsageSummary',
            summary: 'Usage summary',
            responses: { '200': { description: 'ok' } },
          },
        },
        '/v3.1/auth/session': {
          get: {
            tags: ['Auth'],
            operationId: 'getSession',
            summary: 'Session',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };

    const server = createOpenAPI({ input: { 'guard-fixture.json': document } });
    const source = await openapiSource(server, { groupBy: 'tag', baseDir: 'api-reference' });
    const generated = new Set(
      loader({ baseUrl: '/reference', source }).getPages().map((page) => page.url),
    );
    const missing = [...expectedReferenceUrls(document, 'api-reference')].filter(
      (url) => !generated.has(url),
    );

    // fumadocs-openapi still silently drops the undeclared tag...
    expect(generated.has('/reference/api-reference/auth/getSession')).toBe(true);
    // ...and the completeness diff is what surfaces the loss. If this ever
    // fails with `missing` empty, upstream fixed the silent drop and the
    // declareOperationTags workaround in lib/openapi.ts can be retired.
    expect(missing).toEqual([
      '/reference/api-reference/projects/postProjectUsageSummary',
    ]);
  });
});

describe('API reference quick links', () => {
  function mdxFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...mdxFiles(fullPath));
      else if (entry.name.endsWith('.mdx')) files.push(fullPath);
    }
    return files;
  }

  /**
   * Parses the serialized endpoints of every ApiEndpointsTable in a file.
   *
   * Validated through the same schema the runtime uses, not a bare
   * JSON.parse: `mdxToCleanMarkdown` degrades a malformed payload to an empty
   * table so one bad page cannot 500 the whole .md response, which means a
   * structurally broken committed payload would otherwise render nothing with
   * no failure signal anywhere. This is that signal.
   */
  function parseEndpointHrefs(content: string, file: string): string[] {
    const hrefs: string[] = [];
    const prefix = /<ApiEndpointsTable endpoints=\{/g;
    let match: RegExpExecArray | null;
    while ((match = prefix.exec(content)) !== null) {
      const start = match.index + match[0].length;
      const end = content.indexOf('} />', start);
      expect(end, `${file}: unterminated ApiEndpointsTable`).toBeGreaterThan(start);
      const parsed = apiEndpointsSchema.safeParse(JSON.parse(content.slice(start, end)));
      expect(
        parsed.success,
        `${file}: ApiEndpointsTable payload fails apiEndpointsSchema:\n${
          parsed.success ? '' : z.prettifyError(parsed.error)
        }`,
      ).toBe(true);
      if (!parsed.success) continue;
      hrefs.push(...parsed.data.map((endpoint) => endpoint.href));
    }
    // A file mentioning the component but yielding no parsed table means the
    // generator's serialization drifted from this extractor — fail loudly
    // instead of silently checking nothing.
    if (content.includes('<ApiEndpointsTable')) {
      expect(hrefs.length, `${file}: found ApiEndpointsTable but extracted no hrefs`).toBeGreaterThan(0);
    }
    return hrefs;
  }

  test('every ApiEndpointsTable href resolves to a generated reference page', async () => {
    const generated = await generatedUrlsPromise;
    const dead: string[] = [];
    let totalHrefs = 0;

    for (const file of mdxFiles(join(DOCS_DIR, 'content/reference'))) {
      const content = readFileSync(file, 'utf-8');
      for (const href of parseEndpointHrefs(content, relative(DOCS_DIR, file))) {
        totalHrefs++;
        if (!generated.has(href)) {
          dead.push(`${relative(DOCS_DIR, file)}: ${href}`);
        }
      }
    }

    // Sanity: the extractor must have found the generated landing pages.
    expect(totalHrefs).toBeGreaterThan(0);
    expect(
      dead,
      `quick links pointing at reference pages that are never generated (would 404):\n${dead.join('\n')}`,
    ).toEqual([]);
  });
});
