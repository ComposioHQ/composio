# Already done

**The goal:** a user pastes one line into any AI agent and Composio sets itself
up completely — install, login, account onboarding, and skills — so every
future agent session already knows Composio.

**The one line (works once everything below ships):**

> Fetch https://docs.composio.dev/onboard.md and follow it to set up Composio.

Everything below is written, tested, and pushed. Nothing is released yet.

## CLI (branch: `onboarding`)

- `composio onboard --yes` does the whole setup in one command: browser login,
  account onboarding, and installs TWO skills into every coding agent it finds
  on the machine (Claude Code, Codex, Cursor, Dust, OpenClaw):
  - the **CLI skill** (how to use the composio command)
  - the **docs skill** (how to find Composio's documentation — fetched live
    from the docs site so it never goes stale)
- The install script (`curl -fsSL https://composio.dev/install | bash`) already
  runs `onboard` automatically after installing.
- `composio docs "some question"` — search the docs from the terminal.
  `composio docs --page /docs/triggers` — print a docs page as markdown.
- `composio status` — one command that prints everything as JSON: version,
  logged in or not, which agents were found, which skills are installed.
- `composio dev triggers create --if-missing` — safe to run twice; won't
  create duplicate triggers.
- Typing a command this CLI version doesn't know tells you to run
  `composio upgrade` (so agents on old versions can fix themselves).
- All tested: 736 tests pass.

## Docs website (branch: `improve-llm-txt`)

- `/onboard.md` — the setup playbook the one-line prompt points at.
- `/skill.md` — the docs skill. It explains how to install itself.
- `/api/docs-search?q=...` — search endpoint any agent can call.
- `llms.txt` rewritten: every link now has a title and description; there are
  smaller full-text files so agents don't have to load one giant 170k-token
  file.
- Every docs page's `.md` version now ends with links to related pages.

## Docs content + design (branches: `dv-example-docs`, `prettier-docs-v2`)

- Docs restructured (sandbox and triggers split into focused pages), each
  section has an "implementation details" block for agents, plus real field
  lessons.
- New example project: FunnelWatch, a business-intelligence agent (featured in
  the examples gallery). Its code was reviewed, hardened, and tested.
- Visual redesign: light-blue "see how we built this" boxes linking each docs
  section to the example that demonstrates it; faster prev/next navigation;
  sidebar shows sections expanded or collapsed per an easy config.
- PRs already open: #3732 (content, CI green) and #3764 (design).
