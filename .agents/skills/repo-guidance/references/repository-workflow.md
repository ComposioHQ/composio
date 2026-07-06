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

Use `mise install` for Node, Bun, Deno, pnpm, Python, and uv. pnpm is managed through mise.

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
pnpm validate:agent-skills
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

- Add a changeset for changes to published TypeScript packages.
- For `@composio/cli`, add a changeset only when intentionally using the stable CLI binary release flow.
- Do not add a changeset for repo guidance, docs-only, tests-only, or validation-only changes unless release metadata changes.

## Generated And Vendor Files

- Do not edit `ts/vendor/`; those trees are read-only references.
- Keep generated outputs owned by their generator.
- For generated client bumps, verify the package version resolves before updating pins.
