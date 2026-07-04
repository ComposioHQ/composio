# AGENTS.md

Documentation-site guidance for AI agents working under `docs/`.

## Scope

`docs/` is a Fumadocs/Next.js site. Docs PRs branch from `next` and target `next`.

## Read Next

- Use the `docs-decisions` skill for docs content, changelogs, decisions, docs automation, or docs review.
- Context references live under `docs/agent-guidance/context/`; use `docs/agent-guidance/context/twoslash.md` before editing typed MDX examples.
- Agent workflow prompts live under `docs/agent-guidance/agents/`.
- Changelog guidance lives at `docs/agent-guidance/guides/changelog.md`.
- Decision records live under `docs/decisions/`; read `docs/decisions/README.md` first.

## Commands

Run commands from `docs/`:

```bash
bun install
bun run dev
bun run build
bun run types:check
bun run lint
bun run lint:links
bun run test
bun run test:integration
bun run generate:toolkits
bun run generate:meta-tools
bun run generate:api-index
```

## Rules

- TypeScript code blocks in MDX are checked during docs builds. Use `docs/agent-guidance/context/twoslash.md` before changing typed examples.
- Internal docs links must be relative site paths such as `/docs/...`, `/reference/...`, or `/assets/...`.
- API reference pages and toolkit/meta-tool data are generated. Do not hand-edit generated data unless the local generator owns it.
- Changelog entries require `title` and `date` frontmatter, and dates use `YYYY-MM-DD`.
- Prefer cURL for API interactions because docs are consumed by humans and AI crawlers.

## Dual-audience pages: `<ForAgent>`

Docs pages serve two audiences from one MDX file: the rendered page is the human guide, and `<ForAgent>` blocks hold section-specific implementation details for AI agents.

- On the human page, `<ForAgent title="...">` renders as a subtle, muted "Implementation details: ..." disclosure (`components/for-agent.tsx`).
- In the page's `.md` output (and `llms-full.txt`), `mdxToCleanMarkdown()` in `lib/source.ts` unwraps each block into a `### For AI agents[: title]` heading, so agents always find instructions under a predictable label.
- Place a block directly under the section it details; a page can have several. Give each a short `title` naming what it covers.
- No markdown headings inside a block: they would land in the page TOC and anchor into a collapsed accordion. Write sub-section titles as standalone bold lines (`**Title**` alone on a line); the `.md` unwrap promotes them to `####` headings.
- Write implementation detail: exact call sequences, argument names, result shapes, gotchas, copy-paste snippets. Do not restate the human guide, and do not duplicate the shared `llmGuardrails` content (that still appends after the page body).
- TypeScript code blocks inside a block are Twoslash-checked like any other; read `docs/agent-guidance/context/twoslash.md` first.
