# Fumadocs - Composio Documentation

## Project Overview
This is the Composio documentation site built with Fumadocs (Next.js-based docs framework).

## Key Files
- `app/global.css` - All custom styles and design tokens
- `source.config.ts` - MDX collections and schema definitions
- `lib/source.ts` - Source loaders and utility functions
- `app/(home)/layout.tsx` - Home layout with navigation
- `app/docs/layout.tsx` - Docs layout with sidebar

## Design Tokens
- `--composio-orange: #ea580c` - Brand accent color
- `--composio-sidebar: #f7f5f2` (light) / `#252220` (dark)
- `--font-sans: 'Inter'` - Body text
- `--font-mono: 'IBM Plex Mono'` - Code blocks

## SDK Reference Docs
Auto-generated TypeScript SDK documentation from `@composio/core` source code.

- **Source**: `ts/packages/core/src/models/*.ts` (JSDoc comments)
- **Generator**: `ts/packages/core/scripts/generate-docs.ts`
- **Output**: `content/reference/sdk-reference/typescript/`
- **Regenerate**: `pnpm --filter @composio/core generate:docs`

CI auto-generates on changes to `ts/packages/core/src/**` via `.github/workflows/generate-sdk-docs.yml`.

## Common Gotchas
1. **CSS variables**: Use `var(--composio-orange)` not `var(--orange)`. Check `global.css` for defined variables.
2. **Date format**: Changelog dates must be YYYY-MM-DD format (validated in schema and runtime)
3. **Toolkits data**: `public/data/toolkits.json` must exist - errors are thrown, not silently ignored
4. **Root directory on Vercel**: Set to `fumadocs` with "Include files outside root directory" DISABLED
5. **Mobile nav**: Always test CSS changes on mobile. Fumadocs uses different nav patterns (dropdown on mobile, horizontal on desktop). Avoid absolute positioning or pseudo-elements that assume horizontal layout.

## Deployment
- Vercel project: `composio/fumadocs`
- Uses `bun install` and `bun run build`
- Root directory: `fumadocs` (this is a monorepo subfolder)
