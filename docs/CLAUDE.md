# Composio Documentation

Documentation site for Composio, built with [Fumadocs](https://fumadocs.dev/).

## Quick Reference

```bash
bun install          # Install dependencies
bun run dev          # Dev server (http://localhost:3000)
bun run build        # Production build (validates TS code blocks)
bun run types:check  # Type check
```

## Project Structure

```
docs/
├── app/                  # Next.js app router
├── content/              # MDX content
│   ├── docs/             # Main documentation
│   ├── examples/         # Example guides
│   ├── changelog/        # Release notes
│   └── reference/        # SDK & API reference
├── components/           # React components
├── lib/                  # Utilities
├── public/               # Static assets
└── .claude/              # Claude context (see below)
```

## Claude Context

Detailed documentation for Claude is organized in `.claude/`:

### Context (Domain Knowledge)
- [fumadocs.md](.claude/context/fumadocs.md) - Framework patterns, design tokens, MDX components
- [twoslash.md](.claude/context/twoslash.md) - TypeScript code block type checking
- [sdk-reference.md](.claude/context/sdk-reference.md) - SDK doc generation

### Guides (How-To)
- [changelog.md](.claude/guides/changelog.md) - Writing changelog entries

### Decisions (ADRs)
- [toolkits.md](.claude/decisions/toolkits.md) - Toolkits page implementation
- [examples.md](.claude/decisions/examples.md) - Examples page plan
- [feedback.md](.claude/decisions/feedback.md) - Feedback system

## Key Rules

1. **TypeScript code blocks are type-checked** - All TS code in MDX is validated at build time. See [twoslash.md](.claude/context/twoslash.md).

2. **Run build before pushing** - `bun run build` catches type errors that `bun dev` misses.

3. **CSS variables** - Use `var(--composio-orange)` not `var(--orange)`. Check `app/global.css`.

4. **Date format** - Changelog dates must be YYYY-MM-DD format.

5. **Toolkits data** - `public/data/toolkits.json` must exist; errors are thrown, not ignored.

6. **Test on mobile** - Fumadocs nav differs on mobile. Avoid assumptions about horizontal layout.
