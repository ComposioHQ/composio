# CODEX.md - Fumadocs for OpenAI Codex

> Instructions for OpenAI Codex when working with this codebase.

## Quick Start

```bash
bun install       # Install dependencies
bun dev           # Start dev server at http://localhost:3000
bun run build     # Production build
bun run types:check  # TypeScript check
bun run lint      # ESLint check
```

## What This Is

Next.js 16 documentation site for [Composio](https://composio.dev) built with [Fumadocs](https://fumadocs.vercel.app/).

**Key URLs:**
- `/docs` - Main documentation
- `/tool-router` - Tool Router docs
- `/reference` - API reference
- `/examples` - Code examples
- `/llms.txt` - LLM-friendly index
- `/llms-full.txt` - Full documentation for LLMs

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **React**: 19
- **TypeScript**: Strict mode
- **Styling**: Tailwind CSS v4
- **Content**: MDX with Fumadocs
- **Package Manager**: Bun

## Project Structure

```
fumadocs/
├── app/                      # Next.js App Router
│   ├── (home)/              # Public pages (docs, reference, etc.)
│   ├── api/                 # API routes
│   │   ├── feedback/        # Page feedback endpoint
│   │   ├── mdx-content/     # AI content negotiation (pure markdown)
│   │   └── search/          # Search endpoint
│   ├── llms.txt/            # LLM index route
│   └── llms-full.txt/       # Full LLM content route
├── components/              # React components
├── content/                 # MDX documentation content
│   ├── docs/               # Main docs
│   ├── reference/          # SDK reference
│   ├── tool-router/        # Tool Router docs
│   └── examples/           # Code examples
├── lib/                    # Utilities
│   ├── source.ts           # Content source loaders
│   ├── path-validation.ts  # Security validation (shared)
│   ├── mdx-to-markdown.ts  # JSX→Markdown converter
│   └── utils.ts            # Helpers (cn, etc.)
├── proxy.ts                # Content negotiation (Next.js 16)
├── source.config.ts        # MDX collection schemas
└── mdx-components.tsx      # Custom MDX components
```

## Content Sources

Defined in `source.config.ts`, loaded in `lib/source.ts`:

| Source | URL | Content Path |
|--------|-----|--------------|
| `source` | `/docs` | `content/docs/` |
| `toolRouterSource` | `/tool-router` | `content/tool-router/` |
| `referenceSource` | `/reference` | `content/reference/` |
| `examplesSource` | `/examples` | `content/examples/` |

## AI Content Negotiation

AI agents can get **pure markdown** (no JSX) via:

```bash
# URL extension
curl https://composio.dev/docs/quickstart.mdx

# Accept header
curl -H "Accept: text/markdown" https://composio.dev/docs/quickstart
```

**How it works:**
1. `proxy.ts` intercepts `.mdx` requests or `Accept: text/markdown`
2. Validates path via `lib/path-validation.ts`
3. Routes to `/api/mdx-content/[...path]`
4. Converts JSX to markdown via `lib/mdx-to-markdown.ts`
5. Returns pure markdown with YAML frontmatter

## Required Patterns

### Client Components (Hydration-Safe)

```tsx
'use client';
import * as React from 'react';

export function Component() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  // localStorage only in effects with try-catch
  const [value, setValue] = React.useState('');
  React.useEffect(() => {
    try {
      setValue(localStorage.getItem('key') || '');
    } catch {} // Handle private browsing
  }, []);

  return <div>{mounted ? value : null}</div>;
}
```

### Path Validation

```tsx
import { validatePath, validatePathSegments } from '@/lib/path-validation';

// DO NOT duplicate validation logic - use shared module
const result = validatePath(userPath);
if (!result.valid) {
  return { error: result.error };
}
```

### YAML Escaping

```tsx
import { escapeYaml } from '@/lib/path-validation';

// ALWAYS escape user content in YAML
const yaml = `title: ${escapeYaml(userTitle)}`;
```

## Key Files

**Read these first:**
- `source.config.ts` - Content collection schemas
- `lib/source.ts` - How content is loaded
- `proxy.ts` - AI content negotiation
- `lib/path-validation.ts` - Security validation
- `lib/mdx-to-markdown.ts` - JSX→Markdown converter

**API Routes:**
- `app/api/mdx-content/[...path]/route.ts` - Serves pure markdown
- `app/api/feedback/route.ts` - Page feedback
- `app/llms.txt/route.ts` - LLM index
- `app/llms-full.txt/route.ts` - Full LLM content

## Common Tasks

### Add Documentation Page

```bash
touch content/docs/my-page.mdx
```

Add frontmatter:
```mdx
---
title: My Page
description: Description for SEO
---

## Introduction

Content here...
```

### Add Component

1. Create in `components/`
2. Use `'use client'` if interactive
3. Add to `mdx-components.tsx` if used in MDX

### Add API Route

1. Create in `app/api/[route]/route.ts`
2. Use shared validation from `lib/path-validation.ts`

## NEVER DO

1. Use `middleware.ts` - deprecated in Next.js 16, use `proxy.ts`
2. Read window/localStorage during render - causes hydration mismatch
3. Use regex `/g` flag with `.test()` - stateful behavior
4. Duplicate path validation - use `lib/path-validation.ts`
5. Return JSX from AI endpoints - convert to markdown first
6. Use `typeof window !== 'undefined'` during render
7. Forget `aria-label` on icon-only buttons
8. Use template literals for className instead of `cn()`

## Testing

```bash
bun run types:check  # TypeScript check
bun run lint         # Lint check
bun run build        # Production build (catches most issues)

# Test MDX content API
curl http://localhost:3000/docs/quickstart.mdx
```

## Environment Variables

```bash
NEXT_PUBLIC_INKEEP_API_KEY=  # Required for AI search (optional)
COMPOSIO_API_KEY=            # For toolkit generation
```

## What's Next

When contributing:
1. Run `bun run types:check` before committing
2. Run `bun run lint` to catch issues
3. Test the dev server with `bun dev`
4. Verify MDX content at `/docs/your-page.mdx`
