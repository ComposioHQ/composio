# Contributing to Composio Fumadocs

Thank you for contributing to Composio's documentation! This guide will help you get started.

## Quick Start

```bash
# Clone and navigate to fumadocs
git clone https://github.com/composiohq/composio.git
cd composio/fumadocs

# Install dependencies
bun install

# Start development server
bun dev

# Open http://localhost:3000
```

## Development Workflow

### 1. Make Changes

- **Documentation content**: Edit files in `content/` directories
- **Components**: Edit files in `components/`
- **Styling**: Edit `app/global.css` or `tailwind.config.ts`
- **Configuration**: Edit `source.config.ts` for content schemas

### 2. Test Changes

```bash
# Type check
bun run types:check

# Lint
bun run lint

# Build (recommended before PR)
bun run build
```

### 3. Submit PR

1. Create a feature branch: `git checkout -b docs/my-change`
2. Make your changes
3. Run tests
4. Submit PR to `next` branch

## Content Guidelines

### MDX Frontmatter

Every MDX file needs frontmatter:

```mdx
---
title: Page Title
description: Brief description for SEO and previews
---

Content starts here...
```

### Code Examples

Use language-specific code blocks:

````mdx
```typescript
const composio = new Composio({ apiKey: 'your-key' });
```
````

For multi-language examples, use CodeTabs:

```mdx
<CodeTabs>
  <CodeTabsList languages={['typescript', 'python']} />
  <CodeTab value="typescript">
    ```typescript
    const result = await composio.tools.execute('TOOL_NAME');
    ```
  </CodeTab>
  <CodeTab value="python">
    ```python
    result = composio.tools.execute('TOOL_NAME')
    ```
  </CodeTab>
</CodeTabs>
```

### API Key Placeholders

Use these placeholders (they get highlighted for copy-with-key feature):

- `YOUR_API_KEY`
- `{{API_KEY}}`
- `{{COMPOSIO_API_KEY}}`
- `<your-api-key>`

## Component Development

### Creating a New Component

1. Create file: `components/my-component.tsx`
2. Use the client component pattern:

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface MyComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export function MyComponent({ className, children }: MyComponentProps) {
  return (
    <div className={cn('base-styles', className)}>
      {children}
    </div>
  );
}
```

3. If used in MDX, add to `mdx-components.tsx`:

```tsx
export const mdxComponents: MDXComponents = {
  // ... existing
  MyComponent,
};
```

### Avoiding Common Bugs

#### Hydration Mismatch

```tsx
// BAD
const value = typeof window !== 'undefined' ? window.location.pathname : '';

// GOOD
const [value, setValue] = React.useState('');
React.useEffect(() => {
  setValue(window.location.pathname);
}, []);
```

#### Regex with /g Flag

```tsx
// BAD - /g flag makes .test() stateful
const patterns = [/foo/g];
patterns.some(p => p.test(str)); // Unreliable!

// GOOD - no /g for detection
const detectPatterns = [/foo/];
const replacePatterns = [/foo/g];
```

#### Event Types

```tsx
// BAD
window.addEventListener('my-event' as any, handler);

// GOOD
const handler = (e: Event) => {
  const customEvent = e as CustomEvent<string>;
  // use customEvent.detail
};
window.addEventListener('my-event', handler);
```

## Architecture

### Directory Structure

```
fumadocs/
├── app/                    # Next.js pages
│   ├── (home)/            # Home/marketing
│   ├── docs/              # Documentation
│   ├── reference/         # API reference
│   └── api/               # API routes
├── components/            # React components
├── content/               # MDX content
│   ├── docs/              # Main docs
│   ├── reference/         # SDK reference
│   ├── changelog/         # Release notes
│   └── examples/          # Code examples
├── lib/                   # Utilities
├── public/                # Static assets
└── source.config.ts       # Content schemas
```

### Content Sources

| Source | URL | Purpose |
|--------|-----|---------|
| docs | `/docs` | Main documentation |
| reference | `/reference` | API + SDK reference |
| tool-router | `/tool-router` | Tool Router docs |
| examples | `/examples` | Code examples |
| changelog | `/docs/changelog` | Release notes |

### Key Files

- `source.config.ts` - Content collection schemas
- `lib/source.ts` - Source loaders
- `mdx-components.tsx` - Custom MDX components
- `tailwind.config.ts` - Styling configuration
- `middleware.ts` - AI content negotiation

## Styling Guide

### Design Tokens

```css
--composio-orange: #ea580c;  /* Brand accent */
--font-sans: 'Inter';        /* Body text */
--font-mono: 'IBM Plex Mono'; /* Code */
```

### Tailwind

Use fumadocs-ui preset classes plus:

- `text-composio-orange` - Brand color
- `font-sans` - Inter font
- `font-mono` - Monospace font

Always use `cn()` utility for conditional classes:

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  className
)} />
```

## Testing Checklist

Before submitting a PR:

- [ ] `bun run types:check` passes
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
- [ ] Changes work in development server
- [ ] Mobile layout tested (if UI changes)
- [ ] Accessibility checked (labels, focus, etc.)

## Questions?

- Check `CLAUDE.md` for detailed architecture docs
- Open an issue at github.com/composiohq/composio
- Join our Discord community
