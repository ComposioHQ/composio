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

## Mobile Considerations
- The nav active underline (`#nd-nav a[data-active="true"]::after`) is hidden on mobile via media query
- Always test navigation changes on mobile - fumadocs uses different nav patterns for mobile vs desktop
- Mobile nav is in a dropdown, desktop nav is horizontal

## Common Gotchas
1. **CSS variables**: Use `var(--composio-orange)` not `var(--orange)`. Check `global.css` for defined variables.
2. **Date format**: Changelog dates must be YYYY-MM-DD format (validated in schema and runtime)
3. **Toolkits data**: `public/data/toolkits.json` must exist - errors are thrown, not silently ignored
4. **Root directory on Vercel**: Set to `fumadocs` with "Include files outside root directory" DISABLED

## Deployment
- Vercel project: `composio/fumadocs`
- Uses `bun install` and `bun run build`
- Root directory: `fumadocs` (this is a monorepo subfolder)
