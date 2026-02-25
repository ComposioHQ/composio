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
│   ├── cookbooks/        # Cookbooks & guides
│   ├── changelog/        # Release notes
│   ├── reference/        # SDK & API reference
│   └── toolkits/         # Toolkit docs + faq/ snippets
├── components/           # React components
├── lib/                  # Utilities
├── public/               # Static assets
├── scripts/              # Build scripts (link checker, etc.)
└── .claude/              # Claude context (see below)
```

## Claude Context

Detailed documentation for Claude is organized in `.claude/`:

### Context (Domain Knowledge)
- [fumadocs.md](.claude/context/fumadocs.md) - Framework patterns, design tokens, MDX components
- [twoslash.md](.claude/context/twoslash.md) - TypeScript code block type checking
- [sdk-reference.md](.claude/context/sdk-reference.md) - SDK doc generation
- [api-reference.md](.claude/context/api-reference.md) - API reference customizations (schema rendering, CSS overrides, upgrade notes)

### Guides (How-To)
- [changelog.md](.claude/guides/changelog.md) - Writing changelog entries

### Decisions (ADRs)
- [toolkits.md](.claude/decisions/toolkits.md) - Toolkits page implementation
- [examples.md](.claude/decisions/examples.md) - Examples/cookbooks page plan
- [feedback.md](.claude/decisions/feedback.md) - Feedback system
- [llm-guardrails.md](.claude/decisions/llm-guardrails.md) - LLM guardrails system (frontmatter-scoped, pipeline-injected)

## Git Workflow

**Docs branches are always based off `next` and PRs target `next`** (not `master`). When creating a new branch for docs work, branch from `next`. When opening a PR, set the base to `next`.

## Key Rules

1. **TypeScript code blocks are type-checked** - All TS code in MDX is validated at build time. See [twoslash.md](.claude/context/twoslash.md).

2. **Run build before pushing** - `bun run build` catches type errors that `bun dev` misses. Also run `bun run scripts/validate-links.ts` to catch broken internal links.

3. **CSS variables** - Use `var(--composio-orange)` not `var(--orange)`. Check `app/global.css`.

4. **Date format** - Changelog dates must be YYYY-MM-DD format.

5. **Toolkits data** - `public/data/toolkits.json` must exist; errors are thrown, not ignored.

6. **Test on mobile** - Fumadocs nav differs on mobile. Avoid assumptions about horizontal layout.

7. **Toolkit FAQ files** - FAQ snippets live in `content/toolkits/faq/{slug}.md`. They're plain markdown (no frontmatter) embedded in toolkit pages at build time, not standalone Fumadocs pages. They're excluded from the toolkits Fumadocs source via `files: ['**/*', '!faq/**']` in `source.config.ts` but still scanned by the link checker.

8. **Link checker** - `scripts/validate-links.ts` validates all internal links. It needs `bunfig.toml` (Bun preload for fumadocs-mdx) to run. Key details:
   - Populate keys use `(home)/` prefix to match the `app/(home)/` route group
   - Fragment validation falls back to parsing raw markdown headings (since `data.toc` is unavailable outside Next.js)
   - Dynamic toolkit pages are validated against slugs from `public/data/toolkits.json`
   - Non-Fumadocs `.md` files (like FAQ snippets) are picked up via `content/**/*.md` glob

## Glossary

`content/docs/glossary.mdx` defines key Composio terms (auth config, session, toolkit, etc.) using `<Glossary>` and `<GlossaryTerm name="...">` components (`components/glossary.tsx`). The component renders a filterable two-column table. The markdown converter in `lib/source.ts` converts `<GlossaryTerm>` tags to `### Term` headings for LLM-friendly output. When adding new Composio concepts, add a `<GlossaryTerm>` entry and update the `keywords` frontmatter array.

## Code Review Guidelines

**`docs/examples/` is tutorial code.** Review for correctness and clarity, not production-readiness. Skip accessibility (aria attributes, focus management), error boundaries, i18n, comprehensive error handling, and similar concerns that add noise to a teaching example. The goal is to teach Composio integration with minimal code.

## AI-Native Documentation

**Prefer cURL over "click"** - Most docs traffic comes from AI crawlers. When documenting API interactions, prefer showing cURL commands over UI instructions like "click this button" or "navigate to settings". cURL is machine-readable and can be directly executed by AI agents.

**LLM guardrails** - Every `.md` endpoint appends invisible guardrails steering AI code generators toward the session-based pattern. Controlled via `llmGuardrails` frontmatter field. See [llm-guardrails.md](.claude/decisions/llm-guardrails.md).
