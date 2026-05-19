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
docs/
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

## Search

Docs search uses Algolia when `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY` is set; otherwise it falls back to the local Fumadocs `/api/search` endpoint for development and tests. The sync script builds a first-party index from MDX/OpenAPI/toolkit data (no crawler required), splits long pages into section-sized records, configures searchable attributes/custom ranking/distinct, requests `clickAnalytics`, and sends search result view/click events with `search-insights`.

```bash
NEXT_PUBLIC_ALGOLIA_APP_ID=62HI9PQZ1L # optional; default shown
NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY=...
NEXT_PUBLIC_ALGOLIA_INDEX_NAME=docs_composio_dev_62hi9pqz1l_pages # optional; default shown
```

Sync the Algolia index with an admin key:

```bash
ALGOLIA_APP_ID=62HI9PQZ1L
ALGOLIA_ADMIN_API_KEY=...
ALGOLIA_INDEX_NAME=docs_composio_dev_62hi9pqz1l_pages bun run sync:search
```

Preview the generated records or test live relevance:

```bash
bun run sync:search --dry-run --samples
ALGOLIA_SEARCH_API_KEY=... bun run test:search "oauth auth config" "gmail send email"
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Dev server |
| `bun run build` | Production build (validates TS code blocks) |
| `bun run types:check` | Type check |
| `bun run sync:search` | Sync docs search records to Algolia |
| `bun run test:search` | Query the configured Algolia index from the terminal |

