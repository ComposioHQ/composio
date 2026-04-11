# API Reference Customization

The API reference is auto-generated from `public/openapi.json` using [fumadocs-openapi](https://fumadocs.dev/docs/openapi). We customize the rendering with hooks and CSS overrides that depend on fumadocs-openapi internals.

**When upgrading fumadocs-openapi, verify all customizations below still work.**

## Architecture

```
public/openapi.json          ← v3.1 spec (auto-fetched, don't edit manually)
public/openapi-v3.json       ← v3.0 spec (auto-fetched, don't edit manually)
components/api-page.tsx      ← createAPIPage config, schema render hook
components/api-page.client.tsx ← Client-side playground config
components/schema-generator.tsx ← Server-side: walks OpenAPI schema → SchemaUIGeneratedData
components/custom-schema-ui.tsx ← Client-side: renders schemas with inline expansion
app/global.css               ← CSS overrides targeting fumadocs-openapi classes
```

## Custom Schema Rendering

We replace fumadocs-openapi's default popover-based schema rendering with Stripe-style inline expandable sections.

### `api-page.tsx`
- `schemaUI.render` hook: intercepts all schema rendering
- Returns `null` for `#/components/schemas/Error` to hide redundant error schemas
- Passes `isResponse` flag (derived from `readOnly`/`writeOnly`) to hide "Required" labels on response fields
- `generateTypeScriptSchema: false` disables the TypeScript Definitions copy box
- `playground: { enabled: true }` enables the interactive API playground (requests are proxied through `/api/proxy`)

### `schema-generator.tsx`
- Server component that walks OpenAPI schemas into a normalized `SchemaUIGeneratedData` structure
- Handles: objects, arrays, oneOf/anyOf, allOf (merged), enums, nullable types
- Generates info tags for `default` (skips `{}` and `[]`) and `format`
- Uses `ctx.schema.getRawRef` for schema identity, falls back to auto-generated IDs

### `custom-schema-ui.tsx`
- Client component (`'use client'`) with Radix Collapsible for expand/collapse
- `ResponseContext` threads `isResponse` down to suppress "Required" on response fields
- `isExpandable()` checks if schemas have actual nested structure (avoids useless expand buttons for primitive unions like `string | string[]`)
- Enums render as compact inline badges with "Possible values:" label

## CSS Overrides (fragile on upgrade)

All in `app/global.css` under the "OpenAPI Reference" section. These target fumadocs-openapi's internal class structure because no hooks exist for these customizations. Parameter fields (Path/Query/Header) and content type labels are rendered by built-in components with no render hooks.

| Rule | Purpose | Why CSS-only |
|------|---------|-------------|
| Hide `span.text-red-400` / `span.text-fd-muted-foreground` | Remove default `*` and `?` field indicators | Parameter fields rendered by built-in components, no hook available |
| `::after` with `content: "Required"` | Add explicit "Required" label for required fields | Same as above |
| `div.border.rounded-lg:not(:has(*))` | Hide empty schema wrapper divs (when Error schema returns null) | Wrapper div rendered outside `schemaUI.render` hook |
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

### Content structure

v3.0 has its own complete page tree under `content/reference/v3/`:
- `v3/index.mdx` — Overview (with v3 links and base URL)
- `v3/authentication.mdx` — Auth docs (with v3 curl examples)
- `v3/rate-limits.mdx`, `v3/errors.mdx` — Duplicated non-API pages
- `v3/api-reference/` — Auto-generated index pages + OpenAPI endpoint pages
- `v3/meta.json` — Sidebar ordering

SDK Reference and Meta Tools are version-independent and shared across both trees.

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
- `nullable: true` (OAS 3.0) is converted by fumadocs-openapi's dereferencer
- Some properties named `deprecated` are required fields (spec issue, not the OpenAPI deprecated flag)
