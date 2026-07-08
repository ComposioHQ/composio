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

This branch is all about **documentation discovery** — making sure an agent
can find the right Composio doc without a human pasting it in:

- `/onboard.md` — the setup playbook the one-line prompt points at.
- `/skill.md` — the docs skill. Installed once per repo (or automatically by
  `composio onboard`), it teaches an agent everything below. It explains how
  to install itself, so "install the skill from this URL" is a full
  instruction.
- `/api/docs-search?q=...` — public search over every docs page and all
  1000+ toolkits. Returns title, description, snippet, and the `.md` URL for
  each hit, so an agent goes from question to the right page in one call.
  Also usable from the terminal via `composio docs` (CLI branch).
- `llms.txt` rewritten: every link now has a title and description (an agent
  can pick the right page instead of guessing from URLs); the legacy v3 API
  reference moved into an "Optional" section; and it advertises the search
  endpoint, the `/toolkits/{slug}.md` pattern, the skill, and the playbook.
- Smaller full-text files with token counts — `/llms-docs.txt` (~90k),
  `/llms-examples.txt` (~10k), `/llms-reference.txt` (~65k) — so agents don't
  have to swallow the one giant 170k-token `/llms-full.txt`.
- Every docs page's `.md` version now ends with links to related pages and
  the next/previous page, so an agent can keep navigating without going back
  to the index.
- Every HTML docs page sends a header advertising its markdown twin, so an
  agent that fetches a normal link a human pasted discovers the clean `.md`
  version. (Appending `.md` to any docs URL, or sending
  `Accept: text/markdown`, already worked.)
- `docs/improve-one-shotting.md` — the spec for the follow-up work (MCP
  server, SDK error links, CLI skill-install channel).

Verified: link checker 0 errors, typecheck clean, every endpoint fetched live.

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
