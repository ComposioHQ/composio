# Composio Docs

The official documentation site for Composio.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **React**: React 19
- **Documentation**: [Fumadocs](https://fumadocs.dev/)
- **Content**: MDX (Markdown + JSX)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Language**: TypeScript 5.9
- **Package Manager**: Bun

## Getting Started

### Prerequisites

- Node.js 20+
- [Bun](https://bun.sh/) (recommended) or npm/pnpm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/composio
cd docs

# Install dependencies
bun install

# Start development server
bun run dev
```

Open [http://localhost:3000/docs](http://localhost:3000/docs) to view the documentation.

## Project Structure

```
├── app/                  # Next.js app router
│   ├── (home)/           # Landing page
│   ├── docs/             # Documentation layout & pages
│   └── api/search/       # Search API endpoint
├── content/
│   └── docs/             # Documentation content (MDX files)
├── lib/
│   ├── source.ts         # Content source configuration
│   └── layout.shared.tsx # Shared layout options
└── source.config.ts      # Fumadocs MDX configuration
```

## Adding Documentation

### Create a new page

Add an MDX file to `content/docs/`:

```mdx
---
title: Your Page Title
description: A brief description
---

Your content here...
```

### Create a section

Create a folder with an `index.mdx`:

```
content/docs/
└── guides/
    ├── index.mdx        # Section landing page
    ├── getting-started.mdx
    └── advanced.mdx
```

### Available Components

Fumadocs provides built-in components you can use in MDX:

```mdx
<Cards>
  <Card title="Title" href="/docs/page" description="Description" />
</Cards>

<Callout type="info">
  Important information here
</Callout>
```

## Contributing

We welcome contributions! Here's how to help:

### Content Contributions

1. Fork the repository
2. Create a branch: `git checkout -b docs/your-topic`
3. Add or edit MDX files in `content/docs/`
4. Submit a pull request

### Code Contributions

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run `bun run build` to verify the build passes
5. Submit a pull request

### Guidelines

- Keep documentation clear and concise
- Use proper headings hierarchy (h2, h3, etc.)
- Include code examples where helpful
- Test your changes locally before submitting

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
