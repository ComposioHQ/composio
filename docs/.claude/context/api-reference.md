# API Reference Customization

The API reference is auto-generated from `public/openapi.json` using [fumadocs-openapi](https://fumadocs.dev/docs/openapi). We customize the rendering with hooks and CSS overrides that depend on fumadocs-openapi internals.

**When upgrading fumadocs-openapi, verify all customizations below still work.**

## Architecture

```
public/openapi.json          ← Auto-fetched from backend (don't edit manually)
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

## OpenAPI Spec Notes

- Spec is OAS 3.0.0 with 60 endpoints
- All error responses (400, 401, 403, 404, 500, etc.) use identical `#/components/schemas/Error` schema
- Error descriptions vary per endpoint and are useful (e.g., 410 means different things on different endpoints)
- `info.description` is empty (backend issue)
- 0/60 endpoints have response examples (backend issue)
- `nullable: true` (OAS 3.0) is converted by fumadocs-openapi's dereferencer
- Some properties named `deprecated` are required fields (spec issue, not the OpenAPI deprecated flag)
