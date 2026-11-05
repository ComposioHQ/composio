# Repository Workflow

## Branches

- Default active base: `next`.
- Create feature branches from `origin/next` unless the user names another base.
- Target PRs at `next` for SDK and docs work.

## Layout

- `ts/`: TypeScript SDK, providers, CLI, examples, and runtime E2E tests.
- `python/`: Python SDK, providers, tests, nox sessions, and release scripts.
- `docs/`: Fumadocs site, generated API/toolkit data, changelogs, and docs automation.
- `.agents/skills/`: canonical local skill tree.
- `docs/agent-guidance/`: neutral docs-agent context and workflow prompts.
- `docs/decisions/`: neutral docs decisions and plans.

## Tooling

Use `mise install` for Node, Bun, pnpm, Python, and uv. pnpm is managed through mise.

Common root commands:

```bash
pnpm install
pnpm build
pnpm build:packages
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:cli
bun run validate:agent-skills
```

Python commands run from `python/`:

```bash
make env
source .venv/bin/activate
make fmt
make chk
make tst
make snt
make build
```

## Changesets

- Public SDK behavior changes need a Changesets note for each affected TypeScript package and/or the private `@composio/python-sdk` marker. Python core and supported providers share one stable release train.
- `@composio/cli` is ignored by Changesets. Never target it in a changeset while it remains ignored; use the `cli-release` skill for beta builds and stable promotion.
- Repo guidance, docs-only, tests-only, internal validation and CLI-only changes do not require an SDK note. Explicit behavior exemptions need a meaningful `<!-- sdk-release-note-exempt: meaningful reason of at least 20 characters -->` comment in the PR body.
- Stable SDKs use **SDK release** on protected `next`: a member issue request, one release PR that a non-requester approves and a person merges, and a tag run that publishes the PR-built candidates. Recover with **Re-run failed jobs**. Read `ts/docs/internal/release.md` before operating it.

## Generated And Vendor Files

- Do not edit `ts/vendor/`; those trees are read-only references.
- Keep generated outputs owned by their generator.
- For generated client bumps, verify the package version resolves before updating pins.
