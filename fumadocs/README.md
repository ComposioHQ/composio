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

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Dev server |
| `bun run build` | Production build |
| `bun run types:check` | Type check |

