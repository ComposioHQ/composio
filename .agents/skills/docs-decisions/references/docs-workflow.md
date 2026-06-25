# Docs Workflow

## Entry Points

- Read `docs/AGENTS.md` before editing docs.
- Docs context lives in `docs/agent-guidance/context/`.
- Docs automation prompts live in `docs/agent-guidance/agents/`.
- Changelog guidance lives in `docs/agent-guidance/guides/changelog.md`.
- Decisions live in `docs/decisions/`.

## Commands

Run from `docs/`:

```bash
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

- Branch docs work from `next` and target PRs at `next`.
- TypeScript code blocks are checked by the docs build. Read the Twoslash context before changing typed examples.
- Use relative site links, not absolute docs URLs, for internal links.
- Generated OpenAPI, toolkit, and meta-tool data should be changed through their scripts.
- Prefer cURL for API interactions because docs are read by humans and agents.

## Automation

When changing docs automation prompts, update the workflow prompt paths under `.github/workflows/` and run the agent-skill validator to catch stale guidance references.
