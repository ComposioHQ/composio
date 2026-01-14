# Composio Docs

Documentation site for Composio, built with [Fumadocs](https://fumadocs.dev/).

## Getting Started

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
fumadocs/
├── app/                  # Next.js app router
├── content/              # MDX content
│   ├── docs/
│   ├── examples/
│   ├── changelog/
│   └── reference/
├── components/           # React components
├── lib/                  # Utilities
└── public/               # Static assets
```

## Adding Content

Create an `.mdx` file in `content/`, add frontmatter, then add to `meta.json`:

```mdx
---
title: Page Title
description: Brief description
---

Content here...
```

### Components

```mdx
<Tabs items={['Python', 'TypeScript']}>
  <Tab value="Python">...</Tab>
  <Tab value="TypeScript">...</Tab>
</Tabs>

<Callout type="info">Note</Callout>

<Cards>
  <Card title="Title" href="/path" />
</Cards>
```

### Sidebar

Each folder has `meta.json` for ordering:

```json
{
  "pages": ["page-one", "page-two"]
}
```

## TypeScript Code Blocks

All TypeScript code blocks in MDX files are **type-checked at build time** using Twoslash. This ensures docs stay in sync with the SDK.

- Use `// @noErrors` to skip checking for partial snippets
- Use `// ---cut---` to hide setup code from output
- Run `bun run build` locally to validate before pushing

See `CLAUDE.md` for detailed patterns and troubleshooting.

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Dev server |
| `bun run build` | Production build (validates TS code blocks) |
| `bun run types:check` | Type check |

