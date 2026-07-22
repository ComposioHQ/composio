# Unified Composio Knowledge Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated `/kb` article tree with a search-first discovery hub that finds the best public Composio answer across Docs, reviewed support answers, OAuth guides, toolkits, examples, reference, and changelog.

**Architecture:** The docs application owns the hub and one normalized knowledge-record contract. Canonical pages remain in their existing systems. Reviewed `support-workflows` answers continue to use the pinned snapshot and freshness gate, but publish at flat `/kb/guide/<slug>` URLs. Local collections and a checked-in OAuth registry feed one Algolia replacement index; every OAuth URL is validated before Algolia is mutated. The hub, topic pages, toolkit pages, global search, and dedicated results page consume that same corpus.

**Tech Stack:** Bun, TypeScript, Next.js 16 App Router, React 19, Fumadocs, Algolia, Tailwind CSS, Bun tests.

## Global Constraints

- Work in `composio/docs` on `codex/public-kb-docs`; target the repository's normal integration branch when publishing.
- Keep `support-workflows` canonical and its current pinned-snapshot/review-gate workflow unchanged. Do not add repository synchronization.
- Do not move Docs, OAuth, toolkit, example, reference, or changelog content into `content/kb`.
- Do not index marketing pages, blog posts, community content, or private support material.
- Use “Composio For You”; do not reintroduce “Rube” in visible text or searchable aliases.
- Exact text matches, action slugs, error messages, API identifiers, and toolkit names must outrank source-type boosts.
- Validate all 43 registered OAuth pages before `replaceAllObjects`; on any failure, exit before changing the Algolia index.
- Keep curated homepage and browse content usable when search is empty or unavailable.
- Preserve guide verification dates, feedback, related links, canonical metadata, sitemap entries, and LLM discovery.
- Never show the complete guide corpus as a Fumadocs sidebar tree.
- Use `apply_patch` for source edits and commit after each green task.

---

### Task 1: Publish KB Guides at Flat Canonical URLs

**Files:**
- Modify: `docs/lib/kb/repository.ts`
- Modify: `docs/lib/kb/generate.ts`
- Modify: `docs/tests/static/kb-generation.test.ts`
- Modify: `docs/tests/static/kb-routes.test.ts`
- Regenerate: `docs/content/kb/**`

**Interfaces:**
- `getKbGuideUrl(guide): /kb/guide/<slug>` becomes the single canonical URL builder.
- `resolveKbAlias(path): string | null` resolves both manifest aliases and every former `/kb/<primary-topic>/<slug>` path.
- Generated guide slugs become `['guide', guide.slug]`; topics no longer determine file location.

- [ ] **Step 1: Change the route and generation expectations first**

Update the focused tests to require:

```ts
expect(getKbGuideUrl(guide)).toBe(`/kb/guide/${guide.slug}`);
expect(resolveKbAlias(`/kb/${guide.topics[0]}/${guide.slug}`))
  .toBe(`/kb/guide/${guide.slug}`);
expect(files).toContain(`guide/${guide.slug}.mdx`);
expect(files).not.toContain(`${guide.topics[0]}/${guide.slug}.mdx`);
```

Also assert that `content/kb/guide/meta.json` contains the published slugs, held guides are absent, and topic folders are not generated.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd docs
bun test tests/static/kb-generation.test.ts tests/static/kb-routes.test.ts
```

Expected: failures show the existing topic-prefixed URLs and generated topic directories.

- [ ] **Step 3: Implement flat generation and legacy resolution**

In `repository.ts`, build URLs only from the guide slug. Resolve aliases by normalizing a leading slash and checking this ordered map:

1. `/kb/<primary-topic>/<slug>` for every manifest guide;
2. every explicit manifest alias;
3. the guide's canonical `/kb/guide/<slug>` path.

In `generate.ts`, produce:

```text
content/kb/index.mdx
content/kb/meta.json
content/kb/guide/meta.json
content/kb/guide/<published-guide>.mdx
```

Keep all guide frontmatter, provenance, verification, related-guide, and external-resource fields. Make `content/kb/meta.json` list `index` and `guide`; do not recreate topic index pages.

- [ ] **Step 4: Regenerate and run GREEN**

Run:

```bash
bun run generate:kb
bun run check:kb
bun test tests/static/kb-generation.test.ts tests/static/kb-routes.test.ts
```

Expected: ten guide files under `content/kb/guide`, the held auth-config guide absent, drift check clean, tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/lib/kb/repository.ts docs/lib/kb/generate.ts docs/tests/static/kb-generation.test.ts docs/tests/static/kb-routes.test.ts docs/content/kb
git commit -m "refactor(docs): flatten public KB guide routes"
```

### Task 2: Define the Unified Knowledge Taxonomy and Record Contract

**Files:**
- Create: `docs/lib/knowledge/types.ts`
- Create: `docs/lib/knowledge/taxonomy.ts`
- Create: `docs/lib/knowledge/metadata.ts`
- Create: `docs/tests/static/knowledge-metadata.test.ts`
- Modify: `docs/lib/search-index.ts`
- Modify: `docs/source.config.ts`

**Interfaces:**

```ts
export type KnowledgeSourceType =
  | 'docs' | 'kb' | 'oauth-guide' | 'toolkit'
  | 'example' | 'reference' | 'changelog' | 'legacy';

export type ProductAreaSlug =
  | 'authentication-and-connected-accounts'
  | 'tools-and-actions'
  | 'triggers-and-webhooks'
  | 'tool-router-mcp-and-workbench'
  | 'sdk-and-api'
  | 'projects-dashboard-and-billing'
  | 'composio-for-you';

export type KnowledgeIntent =
  | 'setup' | 'how-to' | 'troubleshooting'
  | 'limits-policy' | 'known-issue' | 'reference';

export interface KnowledgeMetadata {
  source_type: KnowledgeSourceType;
  canonical_url: string;
  product_areas: ProductAreaSlug[];
  toolkit_slugs: string[];
  intents: KnowledgeIntent[];
  last_verified_at: string | null;
}
```

`AlgoliaDocsRecord` extends `KnowledgeMetadata`. Keep the existing human-readable `type` field during this migration so the global dialog remains compatible; use `source_type` for filtering and ranking.

- [ ] **Step 1: Write taxonomy and normalization tests**

Cover:

- the six stable product areas and their labels/descriptions;
- `composio-for-you` as an optional seventh facet, not a default empty homepage card;
- KB topic mappings, including authentication + connected accounts collapsing into one area;
- docs path mappings for `auth-configuration`, `providers`, `tools-direct`, `setting-up-triggers`, `extending-sessions`, `migration-guide`, and `sandbox`;
- all reference records mapping to `sdk-and-api`;
- toolkit records carrying their normalized slug;
- KB verification dates and multi-area mappings;
- removal of `rube` from aliases and keywords.

Representative assertions:

```ts
expect(classifyKnowledgeRecord(kbRecord).product_areas)
  .toEqual(['authentication-and-connected-accounts', 'tools-and-actions']);
expect(classifyKnowledgeRecord(toolkitRecord).toolkit_slugs).toEqual(['github']);
expect(normalizeKnowledgeKeywords(['Rube', 'Composio For You']))
  .toEqual(['Composio For You']);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/static/knowledge-metadata.test.ts`

Expected: failure because `lib/knowledge/*` does not exist and search records lack the normalized fields.

- [ ] **Step 3: Implement taxonomy and deterministic metadata**

Export from `taxonomy.ts`:

```ts
export const PRODUCT_AREAS: readonly ProductArea[];
export function isProductAreaSlug(value: string): value is ProductAreaSlug;
export function getProductArea(slug: ProductAreaSlug): ProductArea;
```

Export from `metadata.ts`:

```ts
export function classifyKnowledgeRecord(input: KnowledgeClassificationInput): KnowledgeMetadata;
export function normalizeToolkitSlug(value: string): string;
export function normalizeKnowledgeKeywords(values: string[]): string[];
```

Use explicit source metadata first and deterministic path/topic rules second. Never guess toolkits from arbitrary prose. Map the current KB manifest topics as follows:

```ts
const KB_TOPIC_AREAS = {
  authentication: ['authentication-and-connected-accounts'],
  'connected-accounts': ['authentication-and-connected-accounts'],
  toolkits: ['tools-and-actions'],
  'triggers-and-webhooks': ['triggers-and-webhooks'],
  'tool-router-and-mcp': ['tool-router-mcp-and-workbench'],
  'sdk-and-api': ['sdk-and-api'],
  'dashboard-and-projects': ['projects-dashboard-and-billing'],
  'billing-and-plans': ['projects-dashboard-and-billing'],
  'composio-for-you': ['composio-for-you'],
} as const;
```

Treat `incidents-and-known-issues` as intent `known-issue`, not a product area. Preserve exact error phrases, action slugs, toolkit aliases, and API identifiers in `keywords`.

- [ ] **Step 4: Extend every local search record**

Update `getFilesystemRecords`, dynamic toolkit records, changelog records, and OpenAPI records so every result has a valid canonical URL and normalized metadata. Apply these close-match page ranks while leaving textual relevance and Algolia typo/proximity rules ahead of rank:

```ts
const CLOSE_MATCH_PAGE_RANK = {
  docs: 2_000,
  kb: 1_900,
  'oauth-guide': 1_700,
  toolkit: 1_500,
  example: 1_300,
  reference: 700,
  changelog: 350,
  legacy: 25,
} as const;
```

- [ ] **Step 5: Run GREEN and a record audit**

Run:

```bash
bun test tests/static/knowledge-metadata.test.ts tests/static/kb-discovery.test.ts
bun -e "import { getAlgoliaSearchDocuments } from './lib/search-index'; const records = await getAlgoliaSearchDocuments(); const invalid = records.filter((r) => !r.canonical_url || !r.source_type || !Array.isArray(r.product_areas)); if (invalid.length) throw new Error(String(invalid.length)); console.log(records.length)"
```

Expected: tests pass; the audit prints a non-zero record count without throwing.

- [ ] **Step 6: Commit**

```bash
git add docs/lib/knowledge docs/lib/search-index.ts docs/source.config.ts docs/tests/static/knowledge-metadata.test.ts
git commit -m "feat(docs): normalize public knowledge metadata"
```

### Task 3: Add the OAuth Guide Registry and Atomic External Validation

**Files:**
- Create: `docs/kb/external-sources/auth-guides.json`
- Create: `docs/lib/knowledge/auth-guides.ts`
- Create: `docs/lib/knowledge/search-replacement.ts`
- Create: `docs/tests/static/auth-guide-indexing.test.ts`
- Modify: `docs/lib/search-index.ts`
- Modify: `docs/scripts/sync-algolia-search.ts`

**Interfaces:**

```ts
export interface AuthGuideRegistryEntry {
  slug: string;
  toolkitSlug: string;
  canonicalUrl: `https://composio.dev/auth/${string}`;
  title: string;
  description: string;
}

export function getAuthGuideRegistry(): AuthGuideRegistryEntry[];
export function getAuthGuideSearchRecords(): AlgoliaDocsRecord[];
export async function validateAuthGuideUrls(
  entries: AuthGuideRegistryEntry[],
  fetchImpl?: typeof fetch,
): Promise<void>;
export async function buildCompleteSearchReplacement(options?: {
  fetchImpl?: typeof fetch;
}): Promise<AlgoliaDocsRecord[]>;
```

- [ ] **Step 1: Write registry and failure-safety tests**

Pin the exact audited slug set in the test:

```ts
const expectedSlugs = [
  'trello', 'gong', 'ramp', 'pagerduty', 'github', 'docusign', 'apollo',
  'rocketlane', 'telegram', 'linear', 'calendly', 'supabase', 'notion',
  'ticktick', 'workday', 'twitter', 'dropbox', 'zendesk', 'confluence',
  'instantly', 'posthog', 'stripe', 'strava', 'snowflake', 'zoho', 'monday',
  'pipedrive', 'slack', 'shopify', 'xero', 'jira', 'linkedin', 'outlook',
  'gitlab', 'canva', 'facebook', 'salesforce', 'asana', 'googleapps', 'zoom',
  'hubspot', 'airtable', 'daytona',
];
```

Assert unique slugs, unique canonical URLs, non-empty titles/descriptions, `oauth-guide` source type, auth product area, matching toolkit slug, and exactly 43 entries. Use an injected fake fetch to prove that one `503` rejects the complete replacement. Spy on a fake Algolia index in the script-level helper and assert `replaceAllObjects` is never called after validation failure.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/static/auth-guide-indexing.test.ts`

Expected: missing registry and validation modules.

- [ ] **Step 3: Populate the checked-in registry from the audited live index**

Use the 43 links and titles exposed by `https://composio.dev/auth` on 2026-07-22. Store one object per slug, in the order returned by that page. Descriptions should state the credential type and toolkit without copying article bodies. The registry is the build-time/search fallback inventory; canonical content remains on `composio.dev/auth`.

- [ ] **Step 4: Implement validation before replacement**

`validateAuthGuideUrls` must issue parallel `GET` requests with redirects enabled, reject non-2xx responses, and include the failing URL in the error. `buildCompleteSearchReplacement` must follow this order:

```ts
const authGuides = getAuthGuideRegistry();
await validateAuthGuideUrls(authGuides, options.fetchImpl);
return getAlgoliaSearchDocuments();
```

`getAlgoliaSearchDocuments` includes registry-derived auth records without performing network I/O. In `sync-algolia-search.ts`, finish `buildCompleteSearchReplacement()` before creating settings or calling `replaceAllObjects`. Preserve `--dry-run`, but make the dry run validate registry structure without requiring network.

- [ ] **Step 5: Run GREEN and the dry run**

Run:

```bash
bun test tests/static/auth-guide-indexing.test.ts
bun run sync:search --dry-run
```

Expected: 43 OAuth records, no duplicate IDs/URLs, failure-safety tests pass, dry-run includes `source_type: oauth-guide`.

- [ ] **Step 6: Commit**

```bash
git add docs/kb/external-sources/auth-guides.json docs/lib/knowledge/auth-guides.ts docs/lib/knowledge/search-replacement.ts docs/lib/search-index.ts docs/scripts/sync-algolia-search.ts docs/tests/static/auth-guide-indexing.test.ts
git commit -m "feat(docs): index audited OAuth guides atomically"
```

### Task 4: Build One Search Service for the Hub

**Files:**
- Create: `docs/lib/knowledge/search.ts`
- Create: `docs/app/api/knowledge-search/route.ts`
- Create: `docs/tests/static/knowledge-search.test.ts`
- Modify: `docs/scripts/sync-algolia-search.ts`

**Interfaces:**

```ts
export type KnowledgeFilter =
  | 'all' | 'docs' | 'kb' | 'oauth' | 'toolkits' | 'reference';

export interface KnowledgeSearchResult {
  objectID: string;
  title: string;
  excerpt: string;
  canonicalUrl: string;
  sourceType: KnowledgeSourceType;
  sourceLabel: string;
  productAreas: ProductAreaSlug[];
  toolkitSlugs: string[];
  lastVerifiedAt: string | null;
}

export interface KnowledgeSearchResponse {
  query: string;
  filter: KnowledgeFilter;
  results: KnowledgeSearchResult[];
  total: number;
}
```

- [ ] **Step 1: Write ranking, filter, and API-contract tests**

Create fixtures for exact title, `CALENDLY_POST_INVITEE`, an Odoo JSON-RPC error phrase, `github`, a conceptual close match, a current reference page, changelog, and legacy reference. Assert:

- exact title/action/error results win regardless of source rank;
- close-match Docs and KB precede OAuth, toolkit, example, reference, changelog, legacy;
- `all` includes every source;
- each filter includes only its mapped sources;
- the Reference filter includes both current reference and API reference records but excludes legacy unless it is the only exact match;
- empty query returns curated browse recovery data rather than every document;
- invalid filters return HTTP 400.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/static/knowledge-search.test.ts`

Expected: missing search service and API route.

- [ ] **Step 3: Implement filter mapping and local deterministic fallback**

Export:

```ts
export const KNOWLEDGE_FILTERS: readonly KnowledgeFilterDefinition[];
export function algoliaFacetFilters(filter: KnowledgeFilter): string[][];
export function searchKnowledgeRecords(
  records: AlgoliaDocsRecord[],
  request: { query: string; filter: KnowledgeFilter; limit: number },
): KnowledgeSearchResponse;
```

Tokenize normalized title, description, headings, content, keywords, action slugs, error phrases, toolkit names, and aliases. Apply exact-match tiers before `page_rank`; use `page_rank` only within the same textual tier. This fallback is for local development and tests, not a second production corpus.

- [ ] **Step 4: Implement the API adapter**

`GET /api/knowledge-search?q=<query>&filter=<filter>` must:

1. validate `q` and `filter`;
2. query the configured Algolia index using the public search key when all required environment variables exist;
3. request the normalized metadata and highlight fields;
4. otherwise use `getAlgoliaSearchDocuments()` plus `searchKnowledgeRecords`;
5. return the same `KnowledgeSearchResponse` shape in both paths;
6. return `Cache-Control: public, max-age=30, stale-while-revalidate=300` for successful non-empty queries.

Update Algolia settings to add `source_type`, `product_areas`, `toolkit_slugs`, and `intents` to `attributesForFaceting`, and add all normalized fields to `attributesToRetrieve`. Put `customRanking: ['desc(page_rank)', 'desc(section_rank)']` after textual ranking criteria.

- [ ] **Step 5: Run GREEN**

Run:

```bash
bun test tests/static/knowledge-search.test.ts
bun run sync:search --dry-run
curl -fsS 'http://localhost:3200/api/knowledge-search?q=canva&filter=all'
```

Expected: tests pass, settings include the four new facets, local endpoint returns a Canva result with a source label and canonical URL.

- [ ] **Step 6: Commit**

```bash
git add docs/lib/knowledge/search.ts docs/app/api/knowledge-search/route.ts docs/scripts/sync-algolia-search.ts docs/tests/static/knowledge-search.test.ts
git commit -m "feat(docs): add unified knowledge search service"
```

### Task 5: Replace `/kb` with the Search-First Hub and Results Page

**Files:**
- Delete: `docs/app/(home)/kb/[[...slug]]/page.tsx`
- Modify: `docs/app/(home)/kb/layout.tsx`
- Create: `docs/app/(home)/kb/page.tsx`
- Create: `docs/app/(home)/kb/search/page.tsx`
- Create: `docs/app/(home)/kb/guide/[slug]/page.tsx`
- Create: `docs/app/(home)/kb/[...legacy]/page.tsx`
- Create: `docs/components/kb/knowledge-hub.tsx`
- Create: `docs/components/kb/knowledge-search-form.tsx`
- Create: `docs/components/kb/knowledge-search-results.tsx`
- Create: `docs/components/kb/source-badge.tsx`
- Create: `docs/tests/static/knowledge-hub.test.tsx`
- Modify: `docs/tests/static/kb-routes.test.ts`

**Interfaces:**
- `/kb` is a custom landing page with no generated article tree.
- `/kb/search?q=<query>&filter=<filter>` is shareable and restores query/filter state from the URL.
- Search submission from the hero navigates to `/kb/search`; changing filters preserves `q`.

- [ ] **Step 1: Write the hub behavior tests**

Assert:

- the hero heading is “Search all Composio knowledge”;
- the search field has a persistent visible label and keyboard focus style;
- submitting `oauth github` produces `/kb/search?q=oauth+github&filter=all`;
- filter buttons expose selected state and are keyboard operable;
- result-count changes use an `aria-live="polite"` region;
- result cards show title, excerpt, text source badge, breadcrumb, and KB verification date;
- zero results show product-area and toolkit recovery links;
- a failed fetch shows a short error while leaving curated browse content visible;
- no `createDocsLayout(knowledgeBaseSource)` or generated page tree remains in the KB root layout.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun test tests/static/knowledge-hub.test.tsx tests/static/kb-routes.test.ts`

Expected: current generated Docs layout fails the hub and no-sidebar assertions.

- [ ] **Step 3: Implement the shell and search components**

Before removing the optional catch-all, move its guide rendering into `guide/[slug]/page.tsx`: preserve `DocsPage`, `DocsTitle`, `DocsBody`, canonical metadata, verification, feedback, related links, and `PageActions`. Add `[...legacy]/page.tsx`, reconstruct the incoming `/kb/...` path, and use `resolveKbAlias` plus `permanentRedirect`; call `notFound()` when no mapping exists. This keeps guide and redirect routes working in the same commit that adds an explicit `/kb` page.

Make `kb/layout.tsx` a simple responsive main shell under the existing global docs header. `knowledge-search-form.tsx` owns only controlled query input and navigation. `knowledge-search-results.tsx` owns request cancellation, loading, result, empty, and failure states. Use links, not client-side content duplication, for canonical results.

Homepage sequence:

1. hero and large search field;
2. six product-area cards from `PRODUCT_AREAS`;
3. compact popular-toolkit section and “View all toolkits”;
4. featured answers/guides;
5. source explanation for Docs, Knowledge Base, OAuth, Toolkits, Examples, Reference, and Changelog.

The desktop content max-width is `80rem`; mobile keeps the same sequence, a full-width input, and horizontally scrollable filter controls. Do not render a guide list in the left rail.

- [ ] **Step 4: Run GREEN and inspect both viewport sizes**

Run:

```bash
bun test tests/static/knowledge-hub.test.tsx tests/static/kb-routes.test.ts
# In a separate terminal, if the docs server is not already running:
bun run dev --port 3200
curl -I http://localhost:3200/kb
curl -I 'http://localhost:3200/kb/search?q=github&filter=all'
```

Expected: tests pass and both routes return 200. Manually inspect `/kb` and `/kb/search?q=github` at 1440×900 and 390×844; verify no article tree, no horizontal page overflow, and visible keyboard focus.

- [ ] **Step 5: Commit**

```bash
git add 'docs/app/(home)/kb' docs/components/kb docs/tests/static/knowledge-hub.test.tsx docs/tests/static/kb-routes.test.ts
git commit -m "feat(docs): build search-first knowledge hub"
```

### Task 6: Add Product-Area and Toolkit Browse Pages

**Files:**
- Create: `docs/lib/knowledge/catalog.ts`
- Create: `docs/app/(home)/kb/topic/[slug]/page.tsx`
- Create: `docs/app/(home)/kb/toolkit/[slug]/page.tsx`
- Create: `docs/app/(home)/kb/toolkits/page.tsx`
- Create: `docs/components/kb/browse-results.tsx`
- Create: `docs/components/kb/toolkit-grid.tsx`
- Create: `docs/tests/static/knowledge-browse.test.tsx`
- Modify: `docs/components/kb/knowledge-hub.tsx`

**Interfaces:**

```ts
export function getFeaturedKnowledgeLinks(): KnowledgeLink[];
export function getKnowledgeByProductArea(slug: ProductAreaSlug): KnowledgeLink[];
export function getKnowledgeByToolkit(slug: string): KnowledgeLink[];
export function getKnowledgeToolkitSummaries(): ToolkitKnowledgeSummary[];
```

- [ ] **Step 1: Write browse-page tests**

Assert that:

- all six stable areas have valid `/kb/topic/<slug>` pages;
- unknown area/toolkit slugs call `notFound()`;
- toolkit pages combine local docs/KB/toolkit/example/reference links and matching OAuth registry links;
- Strava includes both its OAuth guide and verified athlete-limit KB answer;
- Canva includes its OAuth guide and autofill KB answer;
- only source types with matches render section headings;
- Composio For You appears on the hub only when its catalog count is non-zero;
- the toolkit grid searches names/aliases and uses existing toolkit logos with text fallbacks.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/static/knowledge-browse.test.tsx`

Expected: missing catalog, browse routes, and components.

- [ ] **Step 3: Implement the catalog without a second content store**

Build browse links from normalized local search documents plus registry-derived OAuth documents. Deduplicate by `canonical_url`. Sort within a page by source rank, then title. Use the existing toolkit dataset/logo component instead of adding another toolkit registry.

Seed featured links from current canonical URLs:

```ts
[
  '/kb/guide/pagination-limits-are-endpoint-specific',
  '/kb/guide/deduplicate-trigger-webhook-deliveries',
  '/kb/guide/custom-connection-data-fields-are-toolkit-specific',
  '/auth/github',
]
```

If a featured canonical URL is absent from the built catalog, fail the catalog test rather than silently hiding it.

- [ ] **Step 4: Implement the pages and toolkit picker**

Topic pages show title, explanation, search scoped through a link to `/kb/search`, and grouped cross-source results. Toolkit pages show toolkit name/logo, OAuth setup when present, and grouped results from every source. `/kb/toolkits` provides the full searchable grid; the hub shows a compact popular subset derived from toolkit popularity data.

- [ ] **Step 5: Run GREEN and verify representative pages**

Run:

```bash
bun test tests/static/knowledge-browse.test.tsx
curl -I http://localhost:3200/kb/topic/authentication-and-connected-accounts
curl -I http://localhost:3200/kb/toolkit/strava
curl -I http://localhost:3200/kb/toolkits
```

Expected: tests pass and all three routes return 200.

- [ ] **Step 6: Commit**

```bash
git add docs/lib/knowledge/catalog.ts 'docs/app/(home)/kb/topic' 'docs/app/(home)/kb/toolkit' 'docs/app/(home)/kb/toolkits' docs/components/kb docs/tests/static/knowledge-browse.test.tsx
git commit -m "feat(docs): add knowledge browse pages"
```

### Task 7: Add Curated Guide Navigation and Complete Redirect Coverage

**Files:**
- Modify: `docs/app/(home)/kb/guide/[slug]/page.tsx`
- Modify: `docs/app/(home)/kb/[...legacy]/page.tsx`
- Create: `docs/components/kb/kb-article-shell.tsx`
- Modify: `docs/tests/static/kb-routes.test.ts`
- Modify: `docs/tests/static/kb-discovery.test.ts`

**Interfaces:**
- Guide pages resolve only generated `['guide', slug]` source pages.
- Legacy routes use `permanentRedirect`, never duplicate-render content.
- Article navigation contains hub, six product areas, and toolkit browse; it never enumerates guides.

- [ ] **Step 1: Write explicit route and article-shell tests**

Cover one guide render, a manifest alias, an old topic-prefixed URL, an unknown route, canonical metadata, `Last verified`, feedback, related links, and the constrained article navigation. Assert redirect status semantics through use of `permanentRedirect`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun test tests/static/kb-routes.test.ts tests/static/kb-discovery.test.ts`

Expected: the explicit routes work, but tests fail because the guide has no curated product-area/toolkit navigation and redirect coverage is incomplete.

- [ ] **Step 3: Implement guide rendering and scoped navigation**

Keep the `DocsPage`, `DocsTitle`, `DocsBody`, `PageActions`, feedback, related-link, and verification behavior already moved in Task 5. Generate static params only from pages whose slugs are `['guide', slug]`. Wrap it with `kb-article-shell.tsx`, which provides a desktop left rail containing:

```text
Knowledge Base home
Product areas
  Authentication and connected accounts
  Tools and actions
  Triggers and webhooks
  Tool Router, MCP, and Workbench
  SDK and API
  Projects, dashboard, and billing
Browse toolkits
```

Collapse this rail behind an accessible mobile control. Do not derive it from `knowledgeBaseSource.pageTree`.

- [ ] **Step 4: Implement legacy redirects**

In `[...legacy]/page.tsx`, reconstruct `/kb/${legacy.join('/')}`, call `resolveKbAlias`, and permanently redirect when it returns a different canonical path. Call `notFound()` otherwise. Include all former topic-prefixed guide paths in static params so redirects are emitted during build where supported.

- [ ] **Step 5: Run GREEN**

Run:

```bash
bun test tests/static/kb-routes.test.ts tests/static/kb-discovery.test.ts
curl -I http://localhost:3200/kb/toolkits/use-canva-autofill-jobs-for-design-content
curl -I http://localhost:3200/kb/guide/use-canva-autofill-jobs-for-design-content
```

Expected: old URL returns a permanent redirect to the flat canonical URL; canonical URL returns 200 with verification and feedback UI.

- [ ] **Step 6: Commit**

```bash
git add 'docs/app/(home)/kb/guide' 'docs/app/(home)/kb/[...legacy]' docs/components/kb/kb-article-shell.tsx docs/tests/static/kb-routes.test.ts docs/tests/static/kb-discovery.test.ts
git commit -m "feat(docs): add canonical KB guides and redirects"
```

### Task 8: Align Global Search, Discovery, and Release Validation

**Files:**
- Modify: `docs/components/custom-search-dialog.tsx`
- Modify: `docs/app/sitemap.ts`
- Modify: `docs/scripts/validate-links.ts`
- Modify: `docs/app/llms.txt/route.ts`
- Modify: `docs/app/llms-full.txt/route.ts`
- Modify: `docs/app/llms.mdx/[[...slug]]/route.ts`
- Modify: `docs/tests/static/navigation.test.ts`
- Modify: `docs/tests/static/kb-discovery.test.ts`
- Create: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Global header search and `/kb/search` use the same Algolia index and canonical URLs.
- Sitemap/LLM discovery includes the hub, browse routes, flat guides, and local canonical content, but does not duplicate external OAuth URLs as local pages.

- [ ] **Step 1: Write the complete corpus and discovery audit**

Assert at least one record for `docs`, `kb`, `oauth-guide`, `toolkit`, `example`, `reference`, and `changelog`; normalized metadata on every record; current reference separated from legacy; held/expired/retired/private pages absent; old topic guide URLs absent from sitemap and LLM outputs; flat guide URLs present; external OAuth canonical URLs present in search but absent from local sitemap.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test tests/static/knowledge-corpus.test.ts tests/static/kb-discovery.test.ts tests/static/navigation.test.ts
```

Expected: failures identify remaining old URLs, missing source fields, or discovery gaps.

- [ ] **Step 3: Update the global dialog and discovery surfaces**

Make the dialog request and render `source_type`/canonical URLs while preserving its existing keyboard behavior and analytics. Use human labels from one shared `SOURCE_LABELS` map. Keep `Knowledge Base` between Docs and Examples in the header.

Add `/kb`, `/kb/search`, six topic pages, `/kb/toolkits`, toolkit landing pages with matches, and flat guides to local discovery. Do not emit query-string search URLs or external auth pages in the docs sitemap. Link validation follows canonical result URLs and accepts `https://composio.dev/auth/*` as external.

- [ ] **Step 4: Run the full automated gate**

Run:

```bash
bun run generate:kb
bun run check:kb
bun run test
bun run types:check
bun run lint:links
bun run sync:search --dry-run
bun run build
```

Expected: generation has no drift, all tests pass, TypeScript is clean, links validate, search dry-run contains all seven public source types plus demoted legacy, and production build succeeds.

- [ ] **Step 5: Perform final manual QA**

With `bun run dev --port 3200`, verify:

- `/kb` at desktop and mobile sizes;
- `/kb/search?q=github`, filters, keyboard navigation, loading, zero-result, and simulated failure states;
- one result each from Docs, KB, OAuth, Toolkit, Example, Reference, and Changelog;
- `/kb/topic/authentication-and-connected-accounts`;
- `/kb/toolkit/strava` and `/kb/toolkit/canva`;
- an old topic-prefixed guide redirect;
- a guide's verification, feedback, related links, and constrained navigation;
- no visible “Rube” text and no full guide tree.

- [ ] **Step 6: Commit**

```bash
git add docs/components/custom-search-dialog.tsx docs/app/sitemap.ts docs/scripts/validate-links.ts docs/app/llms.txt/route.ts docs/app/llms-full.txt/route.ts 'docs/app/llms.mdx/[[...slug]]/route.ts' docs/tests/static/navigation.test.ts docs/tests/static/kb-discovery.test.ts docs/tests/static/knowledge-corpus.test.ts
git commit -m "feat(docs): complete unified knowledge discovery"
```

## Release Checkpoint

Do not run the production Algolia replacement or deploy during implementation without explicit release authorization. When the branch is ready, present:

- the full verification output;
- record counts by `source_type`;
- the 43/43 OAuth validation result;
- desktop/mobile screenshots of the hub and search results;
- a redirect sample and a canonical guide sample;
- the branch commits for review.
