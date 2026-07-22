# Public Knowledge Base Docs Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the reviewed Composio support knowledge snapshot at `docs.composio.dev/kb` using the existing Fumadocs application.

**Architecture:** `support-workflows` remains canonical. The docs repo stores a pinned public source snapshot and publication manifest, validates and generates Fumadocs MDX from that snapshot, then exposes the resulting collection through native docs routes, navigation, search, sitemap, feedback, and LLM discovery.

**Tech Stack:** Bun, TypeScript, Next.js 16, React 19, Fumadocs, Algolia, Vitest-compatible Bun tests.

## Global Constraints

- Branch from and target `next`.
- Do not modify or synchronize back to `support-workflows`.
- Do not introduce a third repository or new deployment.
- Publish only entries whose state is `published` and whose review deadline is in the future.
- Keep the time-sensitive auth-config page in `needs-review`.
- Use native Fumadocs layouts and the existing docs feedback, search, sitemap, and LLM systems.
- Use relative site links for internal documentation URLs.
- Do not hand-edit generated OpenAPI, toolkit, or SDK surfaces.

---

### Task 1: Port the Publication Catalog and Validation Gate

**Files:**
- Create: `docs/lib/kb/types.ts`
- Create: `docs/lib/kb/source-document.ts`
- Create: `docs/lib/kb/catalog.ts`
- Create: `docs/lib/kb/repository.ts`
- Create: `docs/tests/static/kb-catalog.test.ts`
- Create: `docs/kb/manifest.json`
- Create: `docs/kb/source/kb/mcp/tool-router-files/public.md`
- Create: `docs/kb/source/kb/platform/pagination/public.md`

**Interfaces:**
- Produces: `buildKbCatalog(manifest, readSource, now): KbCatalog`.
- Produces: `getKbCatalog(): KbCatalog`, `getPublishedKbGuides(): KbGuide[]`, and `resolveKbAlias(path): string | null`.
- Consumes: a manifest pinned to `ComposioHQ/support-workflows@5eed614`.

- [ ] **Step 1: Write failing catalog tests**

Cover section extraction, two published guides, one held guide, expired review rejection, private-marker rejection, and alias resolution.

```ts
expect(getPublishedKbGuides()).toHaveLength(2);
expect(getKbCatalog().guides.filter((guide) => guide.state === 'needs-review')).toHaveLength(1);
expect(() => buildKbCatalog(expiredManifest, readSource, new Date('2026-07-22')))
  .toThrow('review window expired');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/static/kb-catalog.test.ts`

Expected: failure because `@/lib/kb/repository` does not exist.

- [ ] **Step 3: Implement the parser, catalog, repository, manifest, and pinned snapshot**

The catalog must reject non-public source files, duplicate routes/aliases,
unknown topics and related guides, private markers, missing verification data,
and expired review deadlines. It must parse only the selected level-two section
into each guide body.

- [ ] **Step 4: Run the focused test and validator assertions**

Run: `bun test tests/static/kb-catalog.test.ts`

Expected: all KB catalog tests pass and the repository reports two published
guides plus one held guide.

- [ ] **Step 5: Commit**

```bash
git add docs/lib/kb docs/tests/static/kb-catalog.test.ts docs/kb
git commit -m "feat(docs): add validated public KB catalog"
```

### Task 2: Generate the Native Fumadocs KB Collection

**Files:**
- Create: `docs/lib/kb/generate.ts`
- Create: `docs/scripts/generate-kb.ts`
- Create: `docs/tests/static/kb-generation.test.ts`
- Generate: `docs/content/kb/**`
- Modify: `docs/package.json`
- Modify: `docs/source.config.ts`
- Modify: `docs/lib/source.ts`

**Interfaces:**
- Consumes: `getKbCatalog()` and `getPublishedKbGuides()` from Task 1.
- Produces: `generateKbContent({ check?: boolean }): KbGenerationSummary`.
- Produces: `knowledgeBaseSource` with `baseUrl: '/kb'`.

- [ ] **Step 1: Write failing generation tests**

Use a temporary output directory and assert that generation creates root and
topic metadata, two guide MDX files, provenance frontmatter, and no MDX file for
the held auth-config guide.

```ts
expect(summary.published).toBe(2);
expect(files).toContain('tool-router-and-mcp/use-tool-router-session-files-as-tool-inputs.mdx');
expect(files.some((file) => file.includes('auth-config-list-pages'))).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/static/kb-generation.test.ts`

Expected: failure because `generateKbContent` does not exist.

- [ ] **Step 3: Implement deterministic generation**

Generate:

```text
content/kb/index.mdx
content/kb/meta.json
content/kb/tool-router-and-mcp/index.mdx
content/kb/tool-router-and-mcp/meta.json
content/kb/tool-router-and-mcp/use-tool-router-session-files-as-tool-inputs.mdx
content/kb/sdk-and-api/index.mdx
content/kb/sdk-and-api/meta.json
content/kb/sdk-and-api/pagination-limits-are-endpoint-specific.mdx
```

Guide frontmatter must contain source path, source heading, source commit,
freshness, last-verified date, review deadline, topics, tags, and aliases.
`--check` compares expected generated text with the checked-in files and exits
non-zero on drift.

- [ ] **Step 4: Register the collection and build hooks**

Add a `knowledgeBase` `defineDocs` collection in `source.config.ts`, export
`knowledgeBaseSource` in `lib/source.ts`, and run `generate:kb` before dev,
build, type generation, and tests. Add `check:kb` for CI-style drift checks.

- [ ] **Step 5: Generate content and run GREEN**

Run:

```bash
bun run generate:kb
bun run check:kb
bun test tests/static/kb-generation.test.ts
```

Expected: two pages generated, held content absent, drift check clean, tests pass.

- [ ] **Step 6: Commit**

```bash
git add docs/lib/kb/generate.ts docs/scripts/generate-kb.ts docs/tests/static/kb-generation.test.ts docs/content/kb docs/package.json docs/source.config.ts docs/lib/source.ts
git commit -m "feat(docs): generate Fumadocs KB content"
```

### Task 3: Add KB Routes, Guide Metadata, and Header Navigation

**Files:**
- Create: `docs/app/(home)/kb/layout.tsx`
- Create: `docs/app/(home)/kb/[[...slug]]/page.tsx`
- Create: `docs/tests/static/kb-routes.test.ts`
- Modify: `docs/lib/layout.shared.tsx`
- Modify: `docs/tests/static/navigation.test.ts`

**Interfaces:**
- Consumes: `knowledgeBaseSource`, `resolveKbAlias`, and generated KB frontmatter.
- Produces: `/kb`, topic pages, canonical guide pages, and permanent alias redirects.

- [ ] **Step 1: Write failing route and navigation tests**

Assert that Knowledge Base follows Docs in `baseOptions().links`, the route uses
the Fumadocs KB source, last verification appears on guide pages, and alias
resolution happens before `notFound()`.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test tests/static/navigation.test.ts tests/static/kb-routes.test.ts`

Expected: failures for the missing header link and KB route files.

- [ ] **Step 3: Implement native routes and navigation**

Use `createDocsLayout(knowledgeBaseSource)`. The page route should use native
`DocsPage`, `DocsTitle`, `DocsBody`, `PageActions`, related links, canonical
metadata, and a visible `Last verified YYYY-MM-DD` stamp. Do not show an Edit on
GitHub link for generated KB prose.

Insert:

```ts
{ text: 'Knowledge Base', url: '/kb', active: 'nested-url' }
```

between Docs and Examples in `baseOptions().links`.

- [ ] **Step 4: Run route and navigation tests**

Run: `bun test tests/static/navigation.test.ts tests/static/kb-routes.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'docs/app/(home)/kb' docs/lib/layout.shared.tsx docs/tests/static/navigation.test.ts docs/tests/static/kb-routes.test.ts
git commit -m "feat(docs): add public knowledge base routes"
```

### Task 4: Integrate Search, Sitemap, Link Validation, and LLM Discovery

**Files:**
- Modify: `docs/lib/search-index.ts`
- Modify: `docs/app/sitemap.ts`
- Modify: `docs/scripts/validate-links.ts`
- Modify: `docs/app/llms.txt/route.ts`
- Modify: `docs/app/llms-full.txt/route.ts`
- Modify: `docs/app/llms.mdx/[[...slug]]/route.ts`
- Create: `docs/tests/static/kb-discovery.test.ts`

**Interfaces:**
- Consumes: `knowledgeBaseSource`.
- Produces: KB records with `type: 'kb'`, KB sitemap URLs, validated KB links,
  and KB entries in all LLM discovery formats.

- [ ] **Step 1: Write failing discovery tests**

Assert that `/kb` content is recognized by `urlFromContentPath`, gets a page
rank between conceptual docs and examples, appears in sitemap and LLM source
lists, and held content is absent.

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test tests/static/kb-discovery.test.ts`

Expected: failures because the KB source is not registered with discovery.

- [ ] **Step 3: Add KB to search and discovery surfaces**

Add `content/kb` routing to `urlFromContentPath`, label it `Knowledge Base`,
rank it at `1_800`, include the source in local search indexes, sitemap, link
validation, `llms.txt`, `llms-full.txt`, and the scoped `llms.mdx` prefix map.

- [ ] **Step 4: Run discovery and search dry-run checks**

Run:

```bash
bun test tests/static/kb-discovery.test.ts
bun run sync:search --dry-run
bun run lint:links
```

Expected: tests pass, Algolia records include `type: kb`, and link validation is clean.

- [ ] **Step 5: Commit**

```bash
git add docs/lib/search-index.ts docs/app/sitemap.ts docs/scripts/validate-links.ts docs/app/llms.txt/route.ts docs/app/llms-full.txt/route.ts 'docs/app/llms.mdx/[[...slug]]/route.ts' docs/tests/static/kb-discovery.test.ts
git commit -m "feat(docs): add KB to search and discovery"
```

### Task 5: Verify the Pivot and Rendered UI

**Files:**
- Modify only files required by verified failures from the commands below.

**Interfaces:**
- Verifies the complete docs-site KB surface and existing docs behavior.

- [ ] **Step 1: Run focused validation**

Run:

```bash
bun run check:kb
bun test tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts tests/static/kb-routes.test.ts tests/static/kb-discovery.test.ts tests/static/navigation.test.ts
```

Expected: all focused tests pass; summary reports two published and one held.

- [ ] **Step 2: Run the docs quality gates**

Run:

```bash
bun run test
bun run types:check
bun run lint
bun run lint:links
bun run build
```

Expected: every command exits zero.

- [ ] **Step 3: Perform local browser QA**

Run `bun run dev`, then verify:

- Knowledge Base appears between Docs and Examples;
- `/kb` renders root cards and search;
- topic and guide pages render with native Fumadocs chrome;
- guide verification metadata and feedback controls are visible;
- the held auth-config URL returns 404 and does not appear in search;
- mobile navigation exposes Knowledge Base.

- [ ] **Step 4: Final clean-state check and commit any verified fixes**

Run:

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: clean worktree and focused KB commits on `codex/public-kb-docs`.

