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
