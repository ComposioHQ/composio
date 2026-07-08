# Already done (this branch: `onboarding`)

**The goal:** a user pastes one line into any AI agent and Composio sets itself
up completely — install, login, account onboarding, and skills — so every
future agent session already knows Composio.

**The one line (works once everything ships):**

> Fetch https://docs.composio.dev/onboard.md and follow it to set up Composio.

Everything below is written, tested, and pushed. Nothing is released yet.

## The one-command setup

- `composio onboard --yes` does the whole setup in one command: browser login,
  account onboarding, and installs TWO skills into every coding agent it finds
  on the machine (Claude Code, Codex, Cursor, Dust, OpenClaw):
  - the **CLI skill** — how to use the composio command (bundled with each
    CLI release)
  - the **docs skill** — how to find Composio's documentation (fetched live
    from https://docs.composio.dev/skill.md so it never goes stale; that URL
    goes live when the `improve-llm-txt` docs branch deploys)
- The install script (`curl -fsSL https://composio.dev/install | bash`) already
  runs `onboard` automatically after installing. Same for global npm installs.
- `composio --install-skill composio-docs claude` installs the docs skill on
  its own, for any supported agent.
- Works without a terminal UI: run non-interactively and it accepts sensible
  defaults instead of hanging on prompts; if the browser can't open, it prints
  the login URL and polls until the user clicks it.

## Making the CLI easy for agents to drive

- `composio docs "some question"` — search the docs from the terminal (uses
  the docs site's search endpoint; results as JSON with markdown URLs).
  `composio docs --page /docs/triggers` — print a docs page as markdown.
- `composio status` — one command that prints everything as JSON: version,
  logged in or not, which agents were found, which skills are installed. The
  first command any setup playbook should run.
- `composio dev triggers create --if-missing` — safe to run twice; won't
  create duplicate triggers (duplicates mean duplicate webhook deliveries).
- Typing a command this CLI version doesn't know tells you to run
  `composio upgrade` — so an agent following instructions written for a newer
  CLI can fix itself.
- `composio whoami` already prints account info as JSON when piped.

## Recovered work

- Earlier onboarding work (the onboard command refactor and its tests) had
  been stranded in a GitHub Desktop stash on a stale branch. It was safely
  recovered into this branch, and the stale branch was deleted (local and
  remote).

## Quality

- Full test suite: 736 tests pass, including new tests for the docs skill
  install, docs search, status, the upgrade hint, and --if-missing.
- Typecheck clean. Lint/format hooks ran on every commit.
