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
Auto-generated SDK documentation from source code.

### TypeScript SDK
- **Source**: `ts/packages/core/src/models/*.ts` (JSDoc comments)
- **Generator**: `ts/packages/core/scripts/generate-docs.ts`
- **Output**: `content/reference/sdk-reference/typescript/`
- **Regenerate**: `pnpm --filter @composio/core generate:docs`

### Python SDK
- **Source**: `python/composio/**/*.py` (docstrings)
- **Generator**: `python/scripts/generate-docs.py` (uses griffe)
- **Output**: `content/reference/sdk-reference/python/`
- **Regenerate**: `cd python && uv run --with griffe python scripts/generate-docs.py`

CI auto-generates on changes to `ts/packages/core/src/**` or `python/composio/**` via `.github/workflows/generate-sdk-docs.yml`.

## Common Gotchas
1. **CSS variables**: Use `var(--composio-orange)` not `var(--orange)`. Check `global.css` for defined variables.
2. **Date format**: Changelog dates must be YYYY-MM-DD format (validated in schema and runtime)
3. **Toolkits data**: `public/data/toolkits.json` must exist - errors are thrown, not silently ignored
4. **Root directory on Vercel**: Set to `fumadocs` with "Include files outside root directory" DISABLED
5. **Mobile nav**: Always test CSS changes on mobile. Fumadocs uses different nav patterns (dropdown on mobile, horizontal on desktop). Avoid absolute positioning or pseudo-elements that assume horizontal layout.

## Twoslash - TypeScript Code Block Type Checking

TypeScript code blocks can be type-checked at build time using Twoslash.

> **Note**: This only validates TypeScript (`ts`, `typescript`) code blocks. Python code blocks are NOT type-checked. A separate Python validation pipeline (using `mypy` or `pyright`) could be added in the future.

### How to use
Add `twoslash` to the code fence to enable type checking:

````md
```ts twoslash
import { Composio } from "@composio/core";
const composio = new Composio({ apiKey: "test" });
//    ^? - hover shows type info in rendered docs
```
````

### Key features
- **Build-time validation**: Code blocks are compiled during build. Type errors fail the build.
- **Opt-in**: Only blocks with `twoslash` annotation are checked. Regular code blocks are unaffected.
- **CI enforcement**: `.github/workflows/fumadocs-build.yml` runs on PRs to fumadocs/

### Annotations
- `// ^?` - Show type on hover at that position
- `// @errors: 2322` - Expect specific error (won't fail build)
- `// @noErrors` - Skip all type checking for this block
- `// ---cut---` - Hide code above this line from output (but include for compilation)

### Configuration
- **Config**: `source.config.ts` - `transformerTwoslash({ explicitTrigger: true })`
- **SDK packages**: Installed as devDependencies for import resolution

### Troubleshooting
- If imports fail, ensure the package is in `devDependencies`
- Use `// @noErrors` for pseudocode or partial examples
- Check CI logs for specific error codes (e.g., 2322 = type mismatch)

## Deployment
- Vercel project: `composio/fumadocs`
- Uses `bun install` and `bun run build`
- Root directory: `fumadocs` (this is a monorepo subfolder)
