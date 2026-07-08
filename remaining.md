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

## 3. Build the login + onboarding flow on the dashboard (dashboard repo)

The CLI's browser login opens `<dashboard URL>?cliKey=<session-id>` and then
polls for up to 10 minutes until the dashboard links that session. The
dashboard side has to carry the rest of the flow:

- **Login linking:** recognize the `cliKey` param, let the user log in (or
  reuse their existing browser session), and link the CLI session so the
  terminal's poll completes. Some of this exists today — audit first.
- **First-time account onboarding:** if the account hasn't onboarded yet,
  run it right there in the browser: connect email, scan consent, and show
  suggested connections. The CLI already assumes this — `composio onboard`
  prints "Email connection and scan consent are completed in the browser
  onboarding."
- **Hand the user back:** end with a clear "you're done — return to your
  terminal" screen so the loop closes.

Plan: audit what the dashboard already does with `cliKey`, build the missing
onboarding steps behind it, and keep the flow short — an agent is sitting in
the terminal waiting on the poll, and it gives up after 10 minutes.

## 4. Test the whole thing once, for real

On a fresh machine (or after deleting `~/.composio` and `~/.agents/skills`):

1. Paste into any agent:
   "Fetch https://docs.composio.dev/onboard.md and follow it to set up Composio."
2. Confirm: CLI installs → browser opens for login → skills appear in
   `~/.agents/skills/` → `composio status` shows everything true.

## 5. Nice-to-haves (specced, not started)

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

- Never use `bun patch` on the `eve` package in docs — it corrupts it. The
  existing postinstall script (`docs/scripts/patch-eve-snapshot-skip.ts`)
  handles the one needed patch.
- The `security/snyk` CI failure on #3732 is an org quota limit, not a code
  problem.
- Everything is pushed; there are no local-only commits or stashes anywhere.
