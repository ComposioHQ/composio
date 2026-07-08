/**
 * Shared derivation of deprecated API-reference URLs and their redirects.
 *
 * The committed OpenAPI specs (`public/openapi.json`, `public/openapi-v3.json`)
 * retain operations flagged `deprecated: true`. This module is the single place
 * that turns that flag into (a) the set of reference URLs to hide and (b) the
 * redirects that keep old deep links from 404ing. It is plain ESM (`.mjs`) so
 * both `next.config.mjs` (redirects) and the TypeScript app code (tree + page
 * filters) import the *same* derivation, and the static tests import its pure
 * functions directly without dragging in the Next config wrappers.
 *
 * `operation.deprecated === true` is the single source of truth — there is no
 * allowlist/denylist of operationIds, so a future deprecation is hidden and
 * redirected on the next spec refresh with no code change.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * @typedef {Object} OpenAPIOperation
 * @property {boolean} [deprecated]
 * @property {string[]} [tags]
 * @property {string} [operationId]
 */

/**
 * @typedef {Object} OpenAPISpec
 * @property {Record<string, Record<string, OpenAPIOperation>>} [paths]
 */

/**
 * @typedef {Object} RedirectEntry
 * @property {string} source
 * @property {string} destination
 * @property {true} permanent
 */

/**
 * The two committed specs and the URL base each mounts under:
 * v3.1 (default) at `api-reference`, v3.0 at `v3/api-reference`.
 * @type {ReadonlyArray<{ file: string, baseDir: string }>}
 */
const SPEC_SOURCES = [
  { file: 'public/openapi.json', baseDir: 'api-reference' },
  { file: 'public/openapi-v3.json', baseDir: 'v3/api-reference' },
];

/**
 * Slugify a tag name into a URL segment. Mirrors the `slugify` in
 * `scripts/generate-api-index.ts` so derived hidden URLs line up exactly with
 * the generated operation and index hrefs.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Iterate every operation in a spec's `paths`.
 * @param {OpenAPISpec} spec
 * @returns {Generator<OpenAPIOperation>}
 */
function* operations(spec) {
  for (const methods of Object.values(spec?.paths ?? {})) {
    for (const operation of Object.values(methods ?? {})) {
      if (operation && typeof operation === 'object') yield operation;
    }
  }
}

/**
 * Tag slugs that still have at least one non-deprecated operation. A tag's
 * overview index page survives (and is a valid redirect target) only if some
 * surviving operation lists it.
 * @param {OpenAPISpec} spec
 * @returns {Set<string>}
 */
function tagsWithSurvivingOps(spec) {
  const surviving = new Set();
  for (const operation of operations(spec)) {
    if (operation.deprecated === true) continue;
    for (const tag of operation.tags ?? []) {
      surviving.add(slugify(tag));
    }
  }
  return surviving;
}

/**
 * Reference URLs for every deprecated operation in a single spec.
 * @param {OpenAPISpec} spec
 * @param {string} baseDir e.g. `api-reference` (v3.1) or `v3/api-reference` (v3.0)
 * @returns {string[]}
 */
export function deprecatedUrlsFromSpec(spec, baseDir) {
  /** @type {string[]} */
  const urls = [];
  for (const operation of operations(spec)) {
    if (operation.deprecated !== true) continue;
    const tag = operation.tags?.[0];
    const operationId = operation.operationId;
    if (!tag || !operationId) continue;
    urls.push(`/reference/${baseDir}/${slugify(tag)}/${operationId}`);
  }
  return urls;
}

/**
 * Redirect entries for every deprecated operation in a single spec. Each
 * deprecated op URL 308-redirects to its tag section index; if that tag has no
 * surviving non-deprecated op (its index page was removed), it falls back to
 * `/reference` (KTD-2).
 * @param {OpenAPISpec} spec
 * @param {string} baseDir
 * @returns {RedirectEntry[]}
 */
export function deprecatedRedirectsFromSpec(spec, baseDir) {
  const surviving = tagsWithSurvivingOps(spec);
  /** @type {RedirectEntry[]} */
  const redirects = [];
  const seen = new Set();
  for (const operation of operations(spec)) {
    if (operation.deprecated !== true) continue;
    const tag = operation.tags?.[0];
    const operationId = operation.operationId;
    if (!tag || !operationId) continue;
    const tagSlug = slugify(tag);
    const source = `/reference/${baseDir}/${tagSlug}/${operationId}`;
    if (seen.has(source)) continue;
    seen.add(source);
    const destination = surviving.has(tagSlug)
      ? `/reference/${baseDir}/${tagSlug}`
      : '/reference';
    redirects.push({ source, destination, permanent: true });
  }
  return redirects;
}

/**
 * Read a committed spec relative to the project root, or `null` if absent.
 * @param {string} file
 * @returns {OpenAPISpec | null}
 */
function readSpec(file) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** @type {ReadonlySet<string> | null} */
let _deprecatedUrls = null;

/**
 * Memoized combined set of deprecated reference URLs across both committed
 * specs (v3.1 + v3.0). Mirrors the `_referenceSource` memo in `lib/source.ts`
 * so the tree filter (`filter-api-version.ts`) and flat page-list filter
 * (`source.ts`) stay in sync from one spec read.
 * @returns {ReadonlySet<string>}
 */
export function getDeprecatedReferenceUrls() {
  if (_deprecatedUrls === null) {
    /** @type {Set<string>} */
    const urls = new Set();
    for (const { file, baseDir } of SPEC_SOURCES) {
      const spec = readSpec(file);
      if (!spec) continue;
      for (const url of deprecatedUrlsFromSpec(spec, baseDir)) urls.add(url);
    }
    _deprecatedUrls = urls;
  }
  return _deprecatedUrls;
}

/** @type {ReadonlyArray<RedirectEntry> | null} */
let _deprecatedRedirects = null;

/**
 * Memoized combined redirect entries across both committed specs, deduped by
 * `source` (v3.1 and v3.0 URLs differ by the `/v3/` prefix, so no real
 * collision — the dedupe is defensive). Spread into `next.config.mjs`.
 * @returns {ReadonlyArray<RedirectEntry>}
 */
export function getDeprecatedReferenceRedirects() {
  if (_deprecatedRedirects === null) {
    /** @type {RedirectEntry[]} */
    const all = [];
    const seen = new Set();
    for (const { file, baseDir } of SPEC_SOURCES) {
      const spec = readSpec(file);
      if (!spec) continue;
      for (const redirect of deprecatedRedirectsFromSpec(spec, baseDir)) {
        if (seen.has(redirect.source)) continue;
        seen.add(redirect.source);
        all.push(redirect);
      }
    }
    _deprecatedRedirects = all;
  }
  return _deprecatedRedirects;
}
