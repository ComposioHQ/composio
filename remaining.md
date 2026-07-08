# Remaining

Do these in order. Nothing here is hard — it's mostly shipping what's built.

## 1. Ship the CLI

- Open a PR for the `onboarding` branch and merge it.
- Cut a CLI release. Until this ships, users on the released CLI don't have
  `onboard`, `docs`, or `status`.

## 2. Ship the docs endpoints

- Open a PR for `improve-llm-txt` (a draft PR description is in the chat
  history / easy to rewrite from already-done.md). It stacks on #3764.
- Merge order: #3732 → #3764 → improve-llm-txt. GitHub retargets the stack
  automatically as each one merges.
- Deploying docs makes `/onboard.md`, `/skill.md`, and `/api/docs-search`
  live. Until then the one-line prompt has nothing to fetch.

## 3. Test the whole thing once, for real

On a fresh machine (or after deleting `~/.composio` and `~/.agents/skills`):

1. Paste into any agent:
   "Fetch https://docs.composio.dev/onboard.md and follow it to set up Composio."
2. Confirm: CLI installs → browser opens for login → skills appear in
   `~/.agents/skills/` → `composio status` shows everything true.

## 4. Nice-to-haves (specced, not started)

All specced in `docs/improve-one-shotting.md` on the `improve-llm-txt` branch:

- **Docs MCP server** — wrap the existing docs search in MCP so IDE agents can
  query docs with zero setup. (~1 day)
- **SDK error messages that link the docs** — errors are the one thing agents
  always read; add "→ docs URL" to the common failures in both SDKs. (~1 day)
- `--json` flags on the few remaining CLI commands that lack them.
- VHS terminal recordings for the new CLI commands (repo convention).
- A CLI e2e test for the full onboard flow (`ts/e2e-tests/cli/onboard/` exists
  as a starting point).

## Things to know (so you don't trip)

- Work happens in the worktree `~/.codex/worktrees/c1d8/composio`, which
  switches branches often — check `git branch --show-current` before editing.
- Never use `bun patch` on the `eve` package in docs — it corrupts it. The
  existing postinstall script (`docs/scripts/patch-eve-snapshot-skip.ts`)
  handles the one needed patch.
- The `security/snyk` CI failure on #3732 is an org quota limit, not a code
  problem.
- `revise-onboarding-plan.md` at the repo root is old scratch planning —
  superseded by these two files; safe to delete.
- Everything is pushed; there are no local-only commits or stashes anywhere.
