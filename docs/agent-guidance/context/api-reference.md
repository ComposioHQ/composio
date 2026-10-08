# API Reference Customization

The API reference is auto-generated from `public/openapi.json` using [fumadocs-openapi](https://fumadocs.dev/docs/openapi). We customize the rendering with hooks and CSS overrides that depend on fumadocs-openapi internals.

**When upgrading fumadocs-openapi, verify all customizations below still work.**

## Architecture

```
public/openapi.json          ← v3.1 spec (auto-fetched, don't edit manually)
public/openapi-v3.json       ← v3.0 spec (auto-fetched, don't edit manually)
components/api-page.tsx      ← createOpenAPIPage config, schema render hook ('use client')
components/schema-generator.tsx ← walks OpenAPI schema → SchemaUIGeneratedData
components/custom-schema-ui.tsx ← renders schemas with inline expansion
lib/openapi.ts               ← createOpenAPI instances + `no_auth` sentinel normalization
lib/openapi-deref.ts         ← inlines in-document $refs for the llms.mdx generator
lib/openapi-slice.ts         ← narrows the document to one page before it crosses to the client
app/global.css               ← CSS overrides targeting fumadocs-openapi classes
```

## Bundled document handling

`<OpenAPIPage />` is a client component, and `getOpenAPIPageProps()` carries a
bundled OpenAPI document in `payload.bundled`.

- In-document `$ref`s survive in the bundled document. Code outside the render
  hook must resolve them: the llms.mdx route inlines them via
  `lib/openapi-deref.ts`, and the schema generator reads through them with
  `ctx.schema.resolve`.
- Sending the entire document across the client boundary on every page is
  wasteful. `lib/openapi-slice.ts` narrows it to the operations a page renders.

## Custom Schema Rendering

We replace fumadocs-openapi's default popover-based schema rendering with Stripe-style inline expandable sections.

### `api-page.tsx`
- `schemaUI.render` hook: intercepts all schema rendering
- Returns `null` for `#/components/schemas/Error` to hide redundant error schemas
- Passes an `isResponse` flag to hide "Required" labels on response fields. It is
  derived from `client.name === 'response'`, NOT from `readOnly`: GET parameters
  and request bodies also set `readOnly`, so it cannot distinguish responses.
- `generateTypeScriptDefinitions: false` disables the TypeScript Definitions copy box
- `playground: { enabled: true }` enables the interactive API playground (requests are proxied through `/api/proxy`)

### `schema-generator.tsx`
- Walks OpenAPI schemas into a normalized `SchemaUIGeneratedData` structure. Runs on
  the client because `api-page.tsx` is a client component.
- Handles: objects, arrays, oneOf/anyOf, allOf (merged), enums, nullable types
- Generates info tags for `default` (skips `{}` and `[]`) and `format`
- Derives schema identity from the raw node's `$ref` (local `getRawRef` in
  `api-page.tsx`), falling back to auto-generated IDs, then resolves the node with
  `ctx.schema.resolve` before reading its contents. Identity must come from the raw
  node or `$ref`-keyed dedup breaks.

### `custom-schema-ui.tsx`
- Client component (`'use client'`) with Radix Collapsible for expand/collapse
- `ResponseContext` threads `isResponse` down to suppress "Required" on response fields
- `isExpandable()` checks if schemas have actual nested structure (avoids useless expand buttons for primitive unions like `string | string[]`)
- Enums render as compact inline badges with "Possible values:" label

## CSS Overrides (fragile on upgrade)

All in `app/global.css` under the "OpenAPI Reference" section. These target fumadocs-openapi's internal class structure because no hooks exist for these customizations.

| Rule | Purpose | Why CSS-only |
|------|---------|-------------|
| `p.text-fd-muted-foreground.not-prose:has(> code.text-xs)` | Hide `application/json` content type labels | No hook to control content type display |

## API Versioning (v3.0 / v3.1)

Two API versions are served side-by-side with a Stripe-style version selector in the top nav bar.

### URL structure
- **v3.1 (default):** `/reference/...` — e.g. `/reference/api-reference/tools/getTools`
- **v3.0:** `/reference/v3/...` — e.g. `/reference/v3/api-reference/tools/getTools`
- All existing v3.1 URLs are unchanged — no breaking changes.

### How it works

```
lib/openapi.ts               ← Creates two OpenAPI instances (v3.1 + v3.0)
lib/source.ts                ← Combined source: v3.1 at api-reference/, v3.0 at v3/api-reference/
lib/api-version.ts           ← Shared detectApiVersion() utility (single source of truth)
lib/use-api-version.ts       ← Client hook wrapping detectApiVersion for React components
lib/filter-api-version.ts    ← Tree filter: hides V3 folder for v3.1, lifts V3 children for v3.0
app/(home)/reference/(v31)/layout.tsx ← v3.1 layout: hardcodes version, renders DocsLayout with filtered tree
app/(home)/reference/v3/layout.tsx    ← v3.0 layout: hardcodes version, renders DocsLayout with filtered tree
components/version-selector.tsx ← Dropdown in top nav, navigates between /reference/ ↔ /reference/v3/
components/api-base-url.tsx  ← Dynamic base URL: v3.1 or v3 based on current path
components/api-endpoints-table.tsx ← Endpoint tables in index pages, shows versioned paths
components/version-badge.tsx ← Badge on endpoint pages showing API version
```

Markdown channels (what agents read — see "Version identity in the markdown
channels" below):

```
lib/source.ts                ← mdxToCleanMarkdown renders ApiBaseUrl + ApiEndpointsTable for .md
app/llms.mdx/[[...slug]]/route.ts ← openapiPageToMarkdown emits the version pointer + guidance
lib/api-endpoints-table-schema.ts ← shared zod schema for the ApiEndpointsTable prop
lib/api-version-guidance.ts  ← the two guidance constants + the tool-path predicate
```

### Version identity in the markdown channels

The signals that separate v3.1 from v3.0 (version dropdown, base URL, endpoint
tables, version badge) all live in the **browser** rendering path. Agents read
`.md`, `llms.txt`, `llms-full.txt`, and the Context7 ingest, none of which walk
that path — so every one of those signals used to be dropped, and the only
concrete request an agent could find was a v3.0 curl example.

There are **two markdown renderers**, and they fail differently:

| Surface | Renderer |
|---------|----------|
| MDX pages under `/reference/**` (incl. `reference.md`, tag pages) | `getLLMText` + `mdxToCleanMarkdown` in `lib/source.ts` |
| OpenAPI operation pages (e.g. `getTools.md`) | `openapiPageToMarkdown` in `app/llms.mdx/[[...slug]]/route.ts` |

A fix in `lib/source.ts` alone does not reach operation pages.

**Composition rule** — the rule most likely to be violated by the next person
adding a channel:

- **Broad channels** (`SESSION_GUARDRAILS`, `DIRECT_EXECUTION_GUARDRAILS`)
  compose **both** `REST_VERSION_GUIDANCE` and `TOOL_VERSION_GUIDANCE`. Their
  reader may call any endpoint.
- **OpenAPI operation pages** get `REST_VERSION_GUIDANCE` always, and
  `TOOL_VERSION_GUIDANCE` only when `isToolVersionPath` matches. They do **not**
  get `SESSION_GUARDRAILS` — it is about SDK code generation, and since it
  composes the tool-version text it would force it onto operations it does not
  apply to.
- **Top notes** (`getLLMText`, `openapiPageToMarkdown`) carry **neither**. They
  are a pointer only: which version, the base URL, the cross-version link. The
  guidance already appears further down the same response.

Two more rules:

- **Any new version-dependent rendering must go through `detectApiVersion`**
  (`lib/api-version.ts`), never an inline `/reference/v3/` string test. Moving
  the legacy tree's URL should be a one-line change in that file.
- **Normalization is `isToolVersionPath`'s job, and only its job.** Callers pass
  the raw spec path key verbatim (`/api/v3.1/tools/{tool_slug}`, with the `/api`
  segment). It strips `/api/v3.1` before `/api/v3` and compares by exact set
  membership — `/tools/enum`, `/tools/execute/proxy`, and
  `tool_router/…/tools` all mention `tools` and none of them is affected.

### Content structure

v3.0 has its own complete page tree under `content/reference/v3/`:
- `v3/index.mdx` — Overview (with v3 links and base URL)
- `v3/authentication.mdx` — Auth docs (with v3 curl examples)
- `v3/rate-limits.mdx`, `v3/errors.mdx` — Duplicated non-API pages
- `v3/api-reference/` — Auto-generated index pages + OpenAPI endpoint pages
- `v3/meta.json` — Sidebar ordering

SDK Reference is version-independent and shared across both trees. Meta Tools moved out of the reference tree entirely — they now live under the Toolkits tab at `/toolkits/meta-tools`.

### Version selector behavior
- On an API page: swaps `/reference/` ↔ `/reference/v3/` (stays on same endpoint/category)
- On overview (`/reference`): navigates to `/reference/v3` (v3 has its own overview)
- Full page reload on every version switch (server re-renders layout with filtered tree)

### Auto-generation pipeline (`docs-update-data.yml`)
1. `fetch-openapi.mjs` — fetches both v3.1 and v3.0 specs from backend
2. `generate-api-index.ts` — generates index pages for both `api-reference/` and `v3/api-reference/`
3. CI tracks: `openapi.json`, `openapi-v3.json`, `api-reference/`, `v3/api-reference/`

### Adding/modifying v3 content
- API endpoint pages are auto-generated from the OpenAPI spec — no manual work needed
- Index pages are auto-generated by `bun run generate:api-index`
- Non-API pages (`v3/index.mdx`, `v3/authentication.mdx`, etc.) are manual copies — update both versions when content changes
- `v3/meta.json` and `v3/api-reference/meta.json` control sidebar ordering

## OpenAPI Spec Notes

- v3.1 spec is OAS 3.0.0 format
- v3.0 spec is also OAS 3.0.0 format with the same tag structure
- All error responses use identical `#/components/schemas/Error` schema
- Error descriptions vary per endpoint and are useful
- `info.description` is empty (backend issue)
- No response examples (backend issue)
- `nullable: true` (OAS 3.0) is converted when fumadocs-openapi dereferences at
  render time
- Some properties named `deprecated` are required fields (spec issue, not the OpenAPI deprecated flag)
