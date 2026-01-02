# Contributing to Composio Docs

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- Node.js 18+

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Run the dev server

```bash
bun run dev
```

The docs will be available at [http://localhost:3000](http://localhost:3000).

### 3. Build for production

```bash
bun run build
```

## Project Structure

```
fumadocs/
├── app/                    # Next.js app router pages
│   └── (home)/            # Main docs routes
│       ├── docs/          # /docs section
│       ├── tool-router/   # /tool-router section
│       ├── examples/      # /examples section
│       └── ...
├── content/               # MDX content files
│   ├── docs/             # Docs pages
│   ├── tool-router/      # Tool Router pages
│   ├── examples/         # Examples pages
│   └── ...
├── components/           # React components
├── lib/                  # Utilities and source config
└── public/              # Static assets
```

## Adding/Editing Content

### Adding a new page

1. Create a new `.mdx` file in the appropriate `content/` folder
2. Add frontmatter with `title` and `description`
3. Add the page to the folder's `meta.json`

Example:

```mdx
---
title: My New Page
description: A brief description
---

Your content here...
```

### Using components

Common components available in MDX:

```mdx
<Tabs items={['Python', 'TypeScript']}>
  <Tab value="Python">Python code here</Tab>
  <Tab value="TypeScript">TypeScript code here</Tab>
</Tabs>

<Callout type="info">Important information</Callout>

<Steps>
  <Step>### Step 1</Step>
  <Step>### Step 2</Step>
</Steps>

<Cards>
  <Card title="Title" href="/path" />
</Cards>
```

## Sidebar Configuration

Each content folder has a `meta.json` that controls sidebar order:

```json
{
  "title": "Section Title",
  "pages": [
    "---Section Header---",
    "page-one",
    "page-two",
    "nested-folder"
  ]
}
```

## Common Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run types:check` | Type check |
