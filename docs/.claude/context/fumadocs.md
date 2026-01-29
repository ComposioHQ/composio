# Fumadocs Framework

Composio docs is built with [Fumadocs](https://fumadocs.dev/), a Next.js-based documentation framework.

## Key Files

| File | Purpose |
|------|---------|
| `source.config.ts` | MDX collections and schema definitions |
| `lib/source.ts` | Source loaders and utility functions |
| `app/(home)/layout.tsx` | Home layout with navigation |
| `app/docs/layout.tsx` | Docs layout with sidebar |
| `app/global.css` | All custom styles and design tokens |
| `mdx-components.tsx` | MDX component registration |

## Design Tokens

```css
--composio-orange: #ea580c    /* Brand accent color */
--composio-sidebar: #f7f5f2   /* Light sidebar */
--composio-sidebar: #252220   /* Dark sidebar */
--font-sans: 'Inter'          /* Body text */
--font-mono: 'IBM Plex Mono'  /* Code blocks */
```

## Content Structure

```
content/
├── docs/           # Main documentation
├── examples/       # Example guides
├── changelog/      # Release notes
└── reference/      # SDK & API reference
```

## MDX Components

Available globally without imports:

- `Tabs`, `Tab`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Accordion`, `Accordions`
- `Callout`
- `Step`, `Steps`
- `Card`, `Cards`
- `ProviderCard`, `ProviderGrid`
- `FrameworkSelector`, `QuickstartFlow`, `FrameworkOption`
- `IntegrationTabs`, `IntegrationContent`
- `ToolTypeFlow`, `ToolTypeOption`
- `Figure`, `Video`
- `CapabilityCard`, `CapabilityList`
- `ToolkitsLanding`
- `StepTitle`
- Lucide icons: `ShieldCheck`, `RouteIcon`, `Key`, `Wrench`, `Database`, `Zap`, `Rocket`, `Code`, `Blocks`, `Plug`, `Play`, `Terminal`, `Palette`, `BookOpen`

## Deployment

- **Platform**: Vercel
- **Project**: `composio/docs`
- **Root directory**: `docs` (monorepo subfolder)
- **Build**: `bun install` and `bun run build`

## Common Gotchas

1. **CSS variables**: Use `var(--composio-orange)` not `var(--orange)`. Check `global.css` for defined variables.

2. **Date format**: Changelog dates must be YYYY-MM-DD format (validated in schema and runtime).

3. **Toolkits data**: `public/data/toolkits.json` must exist - errors are thrown, not silently ignored.

4. **Root directory on Vercel**: Set to `docs` with "Include files outside root directory" DISABLED.

5. **Mobile nav**: Always test CSS changes on mobile. Fumadocs uses different nav patterns (dropdown on mobile, horizontal on desktop). Avoid absolute positioning or pseudo-elements that assume horizontal layout.

6. **Twoslash in dev**: Twoslash is disabled in `bun dev` due to heap memory issues. Run `bun run build` locally to catch type errors. See `.claude/context/twoslash.md`.
