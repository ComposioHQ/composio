# AGENTS.md

Repository guidance for Codex, Claude Code, Cursor, pi.dev, and other AI coding agents.

## Scope

This is the Composio SDK v3 monorepo. Most product code lives in `ts/` and `python/`; docs live in `docs/`. Branch new work from `next` and target PRs at `next` unless the user says otherwise.

## First Steps

1. Read the nearest nested `AGENTS.md` before editing a subtree.
2. Preserve unrelated dirty work. Do not revert, delete, or reformat files outside the requested scope.
3. Treat `.agents/skills` as the canonical local skill tree. `.claude/skills` is a compatibility symlink and must not be edited as a separate copy.
4. Do not edit generated SDK surfaces or vendor trees — see [Generated And Vendored Paths](#generated-and-vendored-paths).
5. Verify every command you write against the current `package.json`, `Makefile`, `noxfile.py`, or workflow file.

## Skill Routing

Use the smallest relevant skill:

- `repo-guidance`: repo layout, branch/PR workflow, changesets, generated files, or cross-repo maintenance.
- `skill-maintenance`: adding or changing local skills, skill references, compatibility mirrors, or validation.
- `bug-fixing`: fixing a defect and choosing regression tests.
- `cross-sdk-parity`: aligning TypeScript and Python behavior, generated client bumps, or API contract drift.
- `docs-decisions`: docs site work, changelogs, docs decisions, or docs automation.
- `eve`: durable backend AI agents built with the eve framework.
- `typescript-sdk`, `typescript-testing`, `typescript-providers`: TypeScript SDK/core/provider work.
- `cli-command`, `cli-e2e`: CLI design/implementation or CLI end-to-end tests.
- `python-sdk`, `python-testing`, `python-providers`, `python-release`: Python SDK/provider/testing/release work.

## Repository Map

```text
ts/                         TypeScript SDK workspace
  packages/core/            @composio/core
  packages/providers/       TypeScript provider adapters
  packages/cli/             Effect-based CLI
  e2e-tests/                Docker runtime and CLI E2E tests
python/                     Python SDK and provider packages
docs/                       Fumadocs documentation site
.agents/skills/             Canonical local agent skills
docs/agent-guidance/        Neutral docs-agent context and workflow instructions
docs/decisions/             Neutral docs decisions and ADR-style records
```

## Generated And Vendored Paths

Do not hand-edit these. They are regenerated or vendored, and edits will be overwritten. They are also marked `linguist-generated`/`linguist-vendored` in `.gitattributes`.

- `ts/vendor/**` — vendored read-only snapshots of Effect and Clack (git submodules); reference only.
- `ts/packages/cli-local-tools/vendor/**` — vendored local-tool sources (git submodules).
- `ts/packages/core/generated/**`, `ts/packages/core/pack/generated/**` — generated SDK surfaces produced by `composio generate` / the build pipeline.
- `pnpm-lock.yaml`, `uv.lock`, `**/bun.lock` — package-manager lockfiles; change them by running the package manager, never by hand.

## Common Commands

Use `mise install` for the pinned toolchain. pnpm is managed through mise, not Corepack.

```bash
pnpm install
pnpm build
pnpm build:packages
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:cli
pnpm validate:agent-skills
pnpm validate:skill-routing
```

Python commands run from `python/` unless otherwise noted:

```bash
make env
source .venv/bin/activate
make fmt
make chk
make tst
make snt
make build
```

## Release And Package Notes

- TypeScript package releases use Changesets. Add a changeset only when published TypeScript packages change.
- Documentation-only and agent-guidance-only changes do not need a changeset.
- Python release metadata lives in `python/pyproject.toml`, `python/setup.py`, and `uv.lock`.
- Bumping generated clients is manual. Verify the package version is published before changing pins.

## Local Guidance Files

- TypeScript workspace: `ts/AGENTS.md`
- Core SDK: `ts/packages/core/AGENTS.md`
- TypeScript providers: `ts/packages/providers/AGENTS.md`
- CLI: `ts/packages/cli/AGENTS.md`
- E2E tests: `ts/e2e-tests/AGENTS.md`
- Python SDK: `python/AGENTS.md`
- Python providers: `python/providers/AGENTS.md`
- Docs: `docs/AGENTS.md`
